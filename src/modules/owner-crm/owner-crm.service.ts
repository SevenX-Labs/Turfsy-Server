import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { SendTurfOfferDto } from './dto/send-turf-offer.dto';
import { BroadcastHistoryQueryDto } from './dto/broadcast-history-query.dto';
import { BookingStatus } from '@prisma/client';

export const ALL_MY_TURFS = 'ALL_MY_TURFS';
export const ALL_APP_USERS = 'ALL_APP_USERS';
export const MAX_BROADCASTS_PER_TURF_24H = 2;

@Injectable()
export class OwnerCrmService {
  private readonly logger = new Logger(OwnerCrmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @InjectQueue('notification') private readonly notificationQueue: Queue,
  ) {}

  /**
   * Validate owner profile existence and ensure target turf(s) belong to this owner
   */
  async validateAndResolveTurfs(ownerAuthId: string, requestedTurfId: string) {
    const owner = await this.prisma.ownerProfile.findUnique({
      where: { authId: ownerAuthId },
      include: {
        turfs: {
          select: {
            id: true,
            name: true,
            ownerProfileId: true,
          },
        },
      },
    });

    if (!owner) {
      throw new NotFoundException('Owner profile not found');
    }

    if (!owner.turfs || owner.turfs.length === 0) {
      throw new BadRequestException('No registered turfs found for this owner');
    }

    if (requestedTurfId === ALL_APP_USERS || requestedTurfId === 'ALL_APP_CUSTOMERS') {
      return {
        owner,
        targetTurfs: owner.turfs,
        targetTurfIds: [ALL_APP_USERS],
        isGlobal: true,
      };
    }

    if (requestedTurfId === ALL_MY_TURFS) {
      return {
        owner,
        targetTurfs: owner.turfs,
        targetTurfIds: owner.turfs.map((t) => t.id),
        isGlobal: false,
      };
    }

    // Specific turf requested: check ownership
    const matchingTurf = owner.turfs.find((t) => t.id === requestedTurfId);
    if (!matchingTurf) {
      // Check if turf exists at all in the system to return 403 vs 404
      const turfExists = await this.prisma.turf.findUnique({
        where: { id: requestedTurfId },
        select: { id: true, ownerProfileId: true },
      });

      if (turfExists) {
        throw new ForbiddenException('Access denied: You do not own this turf');
      }
      throw new NotFoundException(`Turf with ID "${requestedTurfId}" not found`);
    }

    return {
      owner,
      targetTurfs: [matchingTurf],
      targetTurfIds: [matchingTurf.id],
    };
  }

  /**
   * Find distinct customer user IDs who previously booked the specified turfs,
   * respecting their notification preferences (offerAlerts & notificationsEnabled).
   */
  async getEligibleCustomerIds(targetTurfIds: string[]): Promise<string[]> {
    if (!targetTurfIds || targetTurfIds.length === 0) {
      return [];
    }

    let candidateUserIds: string[] = [];

    // Check if broadcasting globally to all app users
    if (targetTurfIds.includes(ALL_APP_USERS)) {
      const allAppCustomers = await this.prisma.auth.findMany({
        where: {
          role: 'USER',
          isActive: true,
          isBanned: false,
        },
        select: { id: true },
      });
      candidateUserIds = allAppCustomers.map((u) => u.id);
    } else {
      // 1. Query past bookings with valid confirmed/completed statuses for target turfs
      const bookings = await this.prisma.booking.findMany({
        where: {
          turfId: { in: targetTurfIds },
          bookingStatus: {
            in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED],
          },
        },
        select: { userId: true },
        distinct: ['userId'],
      });

      candidateUserIds = Array.from(
        new Set(bookings.map((b) => b.userId).filter(Boolean)),
      );
    }

    if (candidateUserIds.length === 0) {
      return [];
    }

    // 2. Query user_settings to filter out users who opted out of offers or notifications
    const disabledSettings = await this.prisma.userSettings.findMany({
      where: {
        authId: { in: candidateUserIds },
        OR: [{ offerAlerts: false }, { notificationsEnabled: false }],
      },
      select: { authId: true },
    });

    const disabledAuthIds = new Set(disabledSettings.map((s) => s.authId));
    const eligibleUserIds = candidateUserIds.filter(
      (id) => !disabledAuthIds.has(id),
    );

    if (eligibleUserIds.length === 0) {
      return [];
    }

    // 3. Ensure target users are active and not banned
    const validUsers = await this.prisma.auth.findMany({
      where: {
        id: { in: eligibleUserIds },
        isActive: true,
        isBanned: false,
      },
      select: { id: true },
    });

    return validUsers.map((u) => u.id);
  }

  /**
   * Anti-spam check: prevent more than MAX_BROADCASTS_PER_TURF_24H per turf every 24 hours
   */
  async checkBroadcastRateLimit(
    ownerProfileId: string,
    requestedTurfId: string,
    targetTurfIds: string[],
  ): Promise<void> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentBroadcasts = await this.prisma.notificationLog.findMany({
      where: {
        sentBy: ownerProfileId,
        targetType: 'OWNER_CRM_BROADCAST',
        createdAt: { gte: twentyFourHoursAgo },
      },
      select: {
        id: true,
        createdAt: true,
        metadata: true,
      },
    });

    if (recentBroadcasts.length === 0) {
      return;
    }

    // Check count for each targeted turf
    for (const turfId of targetTurfIds) {
      const turfBroadcastCount = recentBroadcasts.filter((log) => {
        const meta = log.metadata as any;
        if (!meta) return false;
        // Matches if previous broadcast was for this specific turf or for ALL_MY_TURFS
        return (
          meta.turfId === ALL_MY_TURFS ||
          meta.turfId === turfId ||
          (Array.isArray(meta.turfIds) && meta.turfIds.includes(turfId))
        );
      }).length;

      if (turfBroadcastCount >= MAX_BROADCASTS_PER_TURF_24H) {
        throw new BadRequestException(
          `Broadcast rate limit exceeded: Turf has already reached the maximum limit of ${MAX_BROADCASTS_PER_TURF_24H} promotional broadcasts in the last 24 hours.`,
        );
      }
    }
  }

  /**
   * Preview eligible audience count before sending
   */
  async getAudienceCount(ownerAuthId: string, turfId: string) {
    const { targetTurfs, targetTurfIds } = await this.validateAndResolveTurfs(
      ownerAuthId,
      turfId,
    );

    const isGlobal = targetTurfIds.includes(ALL_APP_USERS);
    const bookingWhere: any = isGlobal
      ? { bookingStatus: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] } }
      : {
          turfId: { in: targetTurfIds },
          bookingStatus: {
            in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED],
          },
        };

    const [totalPastBookings, eligibleCustomerIds] = await Promise.all([
      this.prisma.booking.count({
        where: bookingWhere,
      }),
      this.getEligibleCustomerIds(targetTurfIds),
    ]);

    return {
      success: true,
      turfId,
      targetTurfNames: isGlobal ? ['All Turfzy App Players'] : targetTurfs.map((t) => t.name),
      audienceCount: eligibleCustomerIds.length,
      totalPastBookings,
    };
  }

  /**
   * Broadcast offer / announcement notification to eligible past customers
   */
  async broadcastOffer(ownerAuthId: string, dto: SendTurfOfferDto) {
    // 1. Verify owner and resolve target turfs
    const { owner, targetTurfs, targetTurfIds } =
      await this.validateAndResolveTurfs(ownerAuthId, dto.turfId);

    // 2. Anti-spam rate limiting check
    await this.checkBroadcastRateLimit(owner.id, dto.turfId, targetTurfIds);

    // 3. Find eligible recipient customer user IDs
    let recipientUserIds = await this.getEligibleCustomerIds(targetTurfIds);

    // If specific target user IDs were provided, intersect with eligible customer audience
    if (dto.targetUserIds && dto.targetUserIds.length > 0) {
      const selectedSet = new Set(dto.targetUserIds);
      recipientUserIds = recipientUserIds.filter((id) => selectedSet.has(id));
    }

    const primaryTurfId =
      targetTurfs.length === 1 ? targetTurfs[0].id : dto.turfId;

    // 4. Build standard notification payload
    const notificationPayloadData = {
      type: 'TURF_OFFER',
      turfId: primaryTurfId,
      turfName: targetTurfs.length === 1 ? targetTurfs[0].name : undefined,
      offerCode: dto.offerCode || undefined,
      discountPercentage: dto.discountPercentage
        ? String(dto.discountPercentage)
        : undefined,
      expiryDate: dto.expiryDate || undefined,
      click_action: 'OPEN_TURF_DETAILS',
      ...(dto.data || {}),
    };

    if (recipientUserIds.length === 0) {
      return {
        success: true,
        recipientsCount: 0,
        enqueued: false,
        message:
          'No eligible past customers found with active notification preferences for the selected turf(s).',
      };
    }

    const isHighVolume = recipientUserIds.length > 100;

    // 5. Dispatch via BullMQ if high volume (>100 recipients), otherwise dispatch directly
    if (isHighVolume) {
      this.logger.log(
        `[CRM_BROADCAST] Enqueueing high-volume offer broadcast to ${recipientUserIds.length} recipients via BullMQ`,
      );
      await this.notificationQueue.add(
        'send-multicast',
        {
          authIds: recipientUserIds,
          title: dto.title,
          body: dto.message,
          data: notificationPayloadData,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );
    } else {
      this.logger.log(
        `[CRM_BROADCAST] Dispatching direct offer broadcast to ${recipientUserIds.length} recipients`,
      );
      await this.notificationsService.sendMulticastNotification(
        recipientUserIds,
        dto.title,
        dto.message,
        notificationPayloadData,
      );
    }

    // 6. Log broadcast in NotificationLog for audit & history
    const log = await this.prisma.notificationLog.create({
      data: {
        title: dto.title,
        body: dto.message,
        targetType: 'OWNER_CRM_BROADCAST',
        targetIds: recipientUserIds,
        sentBy: owner.id, // Stored as ownerProfileId
        sentCount: recipientUserIds.length,
        metadata: {
          ownerAuthId,
          ownerProfileId: owner.id,
          turfId: dto.turfId,
          turfIds: targetTurfIds,
          turfNames: targetTurfs.map((t) => t.name),
          offerCode: dto.offerCode || null,
          discountPercentage: dto.discountPercentage || null,
          expiryDate: dto.expiryDate || null,
          enqueued: isHighVolume,
          data: notificationPayloadData,
        },
      },
    });

    return {
      success: true,
      broadcastId: log.id,
      recipientsCount: recipientUserIds.length,
      enqueued: isHighVolume,
      message: isHighVolume
        ? `Offer broadcast successfully enqueued for ${recipientUserIds.length} customers via background worker`
        : `Offer broadcast successfully dispatched to ${recipientUserIds.length} customers`,
    };
  }

  /**
   * List past broadcast offers sent by this owner with pagination
   */
  async getBroadcastHistory(
    ownerAuthId: string,
    query: BroadcastHistoryQueryDto,
  ) {
    const owner = await this.prisma.ownerProfile.findUnique({
      where: { authId: ownerAuthId },
      select: { id: true },
    });

    if (!owner) {
      throw new NotFoundException('Owner profile not found');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 10));
    const skip = (page - 1) * limit;

    const baseWhere: any = {
      sentBy: owner.id,
      targetType: 'OWNER_CRM_BROADCAST',
    };

    const [total, rawLogs] = await Promise.all([
      this.prisma.notificationLog.count({ where: baseWhere }),
      this.prisma.notificationLog.findMany({
        where: baseWhere,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Format logs for client display
    let formattedData = rawLogs.map((log) => {
      const meta = (log.metadata as any) || {};
      return {
        id: log.id,
        turfId: meta.turfId || ALL_MY_TURFS,
        turfNames: meta.turfNames || [],
        title: log.title,
        body: log.body,
        offerCode: meta.offerCode || null,
        discountPercentage: meta.discountPercentage || null,
        expiryDate: meta.expiryDate || null,
        recipientCount: log.sentCount,
        enqueued: meta.enqueued ?? false,
        sentAt: log.createdAt,
      };
    });

    // If specific turfId requested in query and not ALL_MY_TURFS, filter in memory
    if (query.turfId && query.turfId !== ALL_MY_TURFS) {
      formattedData = formattedData.filter((item) => item.turfId === query.turfId);
    }

    return {
      success: true,
      data: formattedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * List distinct past customers who booked owner's turf(s) with contact details,
   * booking counts, last booking date, and notification preference status.
   */
  async getPastCustomers(
    ownerAuthId: string,
    query: { turfId?: string; search?: string; limit?: number; offset?: number },
  ) {
    const requestedTurfId = query.turfId || ALL_MY_TURFS;
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const offset = Math.max(Number(query.offset) || 0, 0);

    const { targetTurfs, targetTurfIds } = await this.validateAndResolveTurfs(
      ownerAuthId,
      requestedTurfId,
    );

    const isGlobal = targetTurfIds.includes(ALL_APP_USERS);

    // 1. Fetch bookings
    const bookings = await this.prisma.booking.findMany({
      where: isGlobal
        ? {
            bookingStatus: {
              in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED],
            },
          }
        : {
            turfId: { in: targetTurfIds },
            bookingStatus: {
              in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED],
            },
          },
      select: {
        userId: true,
        turfId: true,
        bookingDate: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (bookings.length === 0 && !isGlobal) {
      return { total: 0, customers: [] };
    }

    // 2. Aggregate per customer
    const userStats = new Map<
      string,
      {
        totalBookings: number;
        lastBookingDate: Date;
        lastTurfId: string;
      }
    >();

    for (const b of bookings) {
      const existing = userStats.get(b.userId);
      const bDate = b.bookingDate || b.createdAt;
      if (!existing) {
        userStats.set(b.userId, {
          totalBookings: 1,
          lastBookingDate: bDate,
          lastTurfId: b.turfId,
        });
      } else {
        existing.totalBookings += 1;
        if (bDate > existing.lastBookingDate) {
          existing.lastBookingDate = bDate;
          existing.lastTurfId = b.turfId;
        }
      }
    }

    let allUserIds: string[] = [];
    if (isGlobal) {
      const globalUsers = await this.prisma.auth.findMany({
        where: { role: 'USER', isActive: true, isBanned: false },
        select: { id: true },
      });
      allUserIds = globalUsers.map((u) => u.id);
    } else {
      allUserIds = Array.from(userStats.keys());
    }

    // 3. Query user profiles & auth & settings
    const users = await this.prisma.auth.findMany({
      where: {
        id: { in: allUserIds },
        isActive: true,
        isBanned: false,
      },
      select: {
        id: true,
        phone: true,
        userProfile: {
          select: {
            name: true,
            username: true,
            email: true,
            avatarUrl: true,
          },
        },
        userSettings: {
          select: {
            offerAlerts: true,
            notificationsEnabled: true,
          },
        },
      },
    });

    const turfNameMap = new Map(targetTurfs.map((t) => [t.id, t.name]));

    let customerList = users.map((u) => {
      const stats = userStats.get(u.id);
      const profile = u.userProfile;
      const settings = u.userSettings;
      const offerAlertsEnabled =
        settings?.offerAlerts !== false && settings?.notificationsEnabled !== false;

      return {
        userId: u.id,
        name: profile?.name || profile?.username || 'Customer',
        phone: u.phone,
        email: profile?.email || null,
        avatarUrl: profile?.avatarUrl || null,
        totalBookings: stats?.totalBookings || 1,
        lastBookingDate: stats?.lastBookingDate || null,
        lastTurfName: stats?.lastTurfId ? turfNameMap.get(stats.lastTurfId) : undefined,
        offerAlertsEnabled,
      };
    });

    // 4. Optional search filter
    if (query.search && query.search.trim()) {
      const s = query.search.trim().toLowerCase();
      customerList = customerList.filter(
        (c) =>
          c.name.toLowerCase().includes(s) ||
          (c.phone && c.phone.toLowerCase().includes(s)) ||
          (c.email && c.email.toLowerCase().includes(s)),
      );
    }

    // Sort by last booking date descending
    customerList.sort((a, b) => {
      const dateA = a.lastBookingDate ? new Date(a.lastBookingDate).getTime() : 0;
      const dateB = b.lastBookingDate ? new Date(b.lastBookingDate).getTime() : 0;
      return dateB - dateA;
    });

    const total = customerList.length;
    const paginated = customerList.slice(offset, offset + limit);

    return {
      total,
      limit,
      offset,
      customers: paginated,
    };
  }
}

