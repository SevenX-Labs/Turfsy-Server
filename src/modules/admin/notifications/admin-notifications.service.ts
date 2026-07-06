import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../../common/notifications/notifications.service';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';

@Injectable()
export class AdminNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async broadcast(dto: BroadcastNotificationDto, adminId: string, ipAddress: string) {
    let targets: string[] = [];

    if (dto.target === 'ALL_USERS') {
      const users = await this.prisma.auth.findMany({
        where: { role: 'USER', deletedAt: null },
        select: { id: true },
      });
      targets = users.map((u) => u.id);
    } else if (dto.target === 'ALL_OWNERS') {
      const owners = await this.prisma.auth.findMany({
        where: { role: 'OWNER', deletedAt: null },
        select: { id: true },
      });
      targets = owners.map((o) => o.id);
    } else if (dto.target === 'BY_CITY') {
      if (!dto.city) {
        throw new BadRequestException('City is required when target is BY_CITY');
      }
      const [usersInCity, ownersInCity] = await Promise.all([
        this.prisma.auth.findMany({
          where: {
            role: 'USER',
            deletedAt: null,
            userProfile: { city: { contains: dto.city, mode: 'insensitive' } },
          },
          select: { id: true },
        }),
        this.prisma.auth.findMany({
          where: {
            role: 'OWNER',
            deletedAt: null,
            ownerProfile: {
              turfs: {
                some: { city: { contains: dto.city, mode: 'insensitive' } },
              },
            },
          },
          select: { id: true },
        }),
      ]);
      targets = [...usersInCity.map((u) => u.id), ...ownersInCity.map((o) => o.id)];
    } else if (dto.target === 'PROMOTIONAL') {
      const active = await this.prisma.auth.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true },
      });
      targets = active.map((a) => a.id);
    }

    // Trigger sending loop in background (fire-and-forget)
    this.sendToTargetsBackground(targets, dto.title, dto.body, dto.data);

    // Create Notification Log in Database
    await this.prisma.notificationLog.create({
      data: {
        title: dto.title,
        body: dto.body,
        targetType: dto.target,
        targetIds: targets,
        sentBy: adminId,
        sentCount: targets.length,
        metadata: (dto.data as any) || {},
      },
    });

    // Audit log
    await this.prisma.adminActionLog.create({
      data: {
        adminId,
        action: 'NOTIFICATION_SENT',
        targetType: 'Broadcast',
        targetId: dto.target,
        reason: `Broadcasted notification to ${targets.length} targets. Title: ${dto.title}`,
        ipAddress,
        metadata: {
          targetGroup: dto.target,
          city: dto.city,
          targetsCount: targets.length,
        },
      },
    });

    return {
      success: true,
      message: `Notification broadcast initiated for ${targets.length} recipients`,
    };
  }

  async getNotificationHistory(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [total, logs] = await Promise.all([
      this.prisma.notificationLog.count(),
      this.prisma.notificationLog.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Fetch admin details
    const adminIds = Array.from(new Set(logs.map((log) => log.sentBy)));
    const admins = await this.prisma.admin.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, name: true, email: true },
    });
    const adminMap = new Map(admins.map((a) => [a.id, a]));

    const data = logs.map((log) => {
      const admin = adminMap.get(log.sentBy);
      return {
        id: log.id,
        title: log.title,
        message: log.body,
        target: log.targetType,
        sentBy: admin ? `${admin.name} (${admin.email})` : log.sentBy,
        sentTime: log.createdAt,
        deliveryStatus: 'SENT',
        sentCount: log.sentCount,
      };
    });

    return {
      success: true,
      data: {
        history: data,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  private async sendToTargetsBackground(targets: string[], title: string, body: string, data?: any) {
    for (const targetId of targets) {
      try {
        await this.notificationsService.sendNotification(targetId, title, body, data);
      } catch (err) {
        // Log error internally and continue
        console.error(`Failed to broadcast notification to user ${targetId}:`, err.message);
      }
    }
  }
}
