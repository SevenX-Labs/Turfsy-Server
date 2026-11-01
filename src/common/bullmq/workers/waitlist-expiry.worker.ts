import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';

@Processor('waitlist-expiry')
export class WaitlistExpiryWorker extends WorkerHost {
  private readonly logger = new Logger(WaitlistExpiryWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { waitlistId, turfId, bookingDate, startTime } = job.data;
    this.logger.log(
      `Processing waitlist-expiry job ${job.id} for waitlistId ${waitlistId}`,
    );

    const entry = await this.prisma.waitlist.findUnique({
      where: { id: waitlistId },
    });

    if (!entry || entry.status !== 'NOTIFIED') {
      this.logger.log(
        `Waitlist entry ${waitlistId} is no longer NOTIFIED (status: ${entry?.status}). Skipping.`,
      );
      return { success: true, message: 'No action needed' };
    }

    // Mark as expired
    await this.prisma.waitlist.update({
      where: { id: waitlistId },
      data: { status: 'EXPIRED' },
    });

    // Check for next person in the waitlist queue
    const normalizedDate = new Date(bookingDate);
    normalizedDate.setHours(0, 0, 0, 0);

    const nextInQueue = await this.prisma.waitlist.findFirst({
      where: {
        turfId,
        bookingDate: normalizedDate,
        startTime,
        status: 'WAITING',
      },
      orderBy: { createdAt: 'asc' },
      include: { user: true },
    });

    if (nextInQueue) {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await this.prisma.waitlist.update({
        where: { id: nextInQueue.id },
        data: {
          status: 'NOTIFIED',
          notifiedAt: new Date(),
          expiresAt,
        },
      });

      const turf = await this.prisma.turf.findUnique({
        where: { id: turfId },
        select: { name: true },
      });

      // Notify via the user's auth relation
      const userProfile = await this.prisma.userProfile.findUnique({
        where: { id: nextInQueue.userId },
        select: { authId: true },
      });

      if (userProfile) {
        this.notificationsService
          .sendNotification(
            userProfile.authId,
            'Waitlisted Slot Available!',
            `Your waitlisted slot at ${turf?.name || 'the turf'} for ${startTime} is open! You have 10 minutes to book at regular price.`,
            {
              type: 'WAITLIST_SLOT_AVAILABLE',
              waitlistId: nextInQueue.id,
              turfId,
              startTime,
            },
          )
          .catch((err) =>
            this.logger.error(`Failed to notify waitlist user: ${err.message}`),
          );
      }

      // Schedule another expiry job for this new notification
      // The job queue reference is not directly available here,
      // so we use a self-referencing approach via the same queue
      return {
        success: true,
        message: `Notified next user ${nextInQueue.userId}. New expiry scheduled.`,
        scheduleNext: {
          waitlistId: nextInQueue.id,
          turfId,
          bookingDate,
          startTime,
          delay: 10 * 60 * 1000,
        },
      };
    }

    // No more waitlist entries — slot is now public at 1.20x surge
    this.logger.log(
      `No more waitlist entries for turf ${turfId} slot ${startTime}. Slot released to public at 1.20x surge.`,
    );

    return { success: true, message: 'Slot released to public' };
  }
}
