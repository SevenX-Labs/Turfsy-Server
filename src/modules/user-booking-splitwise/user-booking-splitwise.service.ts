import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/services/cache.service';
import { RateLimiterService } from '../../common/services/rate-limiter.service';
import { PaymentLoggerService } from '../../common/services/payment-logger.service';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { AddPlayersDto } from './dto/add-players.dto';
import { SetAmountsDto } from './dto/set-amounts.dto';
import { SplitPlayerStatus } from '@prisma/client';

@Injectable()
export class UserBookingSplitwiseService {
  private readonly logger = new Logger(UserBookingSplitwiseService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly rateLimiter: RateLimiterService,
    private readonly paymentLogger: PaymentLoggerService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async getLeadUsernameOrThrow(authId: string): Promise<string> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { authId },
      select: { username: true },
    });

    if (!profile?.username) {
      throw new BadRequestException(
        'Please set a username in your profile before using splitwise',
      );
    }

    return profile.username;
  }

  private async ensureLeadPlayer(
    splitId: string,
    authId: string,
    leadUsername: string,
    existingPlayers: Array<{
      id: string;
      username: string;
      userId: string | null;
    }>,
  ) {
    const existing =
      existingPlayers.find((p) => p.userId === authId) ??
      existingPlayers.find((p) => p.username === leadUsername);

    if (existing) {
      const data: { username?: string; userId?: string } = {};
      if (existing.username !== leadUsername) data.username = leadUsername;
      if (!existing.userId) data.userId = authId;

      if (Object.keys(data).length > 0) {
        await this.prisma.bookingSplitPlayer.update({
          where: { id: existing.id },
          data,
        });
        return true;
      }
      return false;
    }

    await this.prisma.bookingSplitPlayer.create({
      data: {
        splitId,
        username: leadUsername,
        userId: authId,
        amount: 0,
      },
    });

    return true;
  }

  private async verifyOwnershipAndGetBooking(
    authId: string,
    bookingId: string,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.userId !== authId) {
      throw new ForbiddenException(
        'You are not authorized to manage this split',
      );
    }
    return booking;
  }

  private async getOrCreateSplit(
    bookingId: string,
    authId: string,
    amount: number,
  ) {
    let split = await this.prisma.bookingSplit.findUnique({
      where: { bookingId },
      include: { players: true },
    });

    if (!split) {
      const leadUsername = await this.getLeadUsernameOrThrow(authId);
      split = await this.prisma.bookingSplit.create({
        data: {
          bookingId,
          leadUserId: authId,
          totalAmount: amount,
          players: {
            create: {
              username: leadUsername,
              userId: authId,
              amount: 0,
            },
          },
        },
        include: { players: true },
      });
      await this.recalculatePendingPlayers(split.id);
    } else if (split.leadUserId !== authId) {
      throw new ForbiddenException('Access denied.');
    } else {
      const leadUsername = await this.getLeadUsernameOrThrow(authId);
      const didChangeLead = await this.ensureLeadPlayer(
        split.id,
        authId,
        leadUsername,
        split.players,
      );
      if (didChangeLead) {
        await this.recalculatePendingPlayers(split.id);
      }

      if (didChangeLead) {
        const refreshed = await this.prisma.bookingSplit.findUnique({
          where: { bookingId },
          include: { players: true },
        });
        if (!refreshed) throw new NotFoundException('Split not found');
        split = refreshed;
      }
    }
    if (!split) throw new NotFoundException('Split not found');
    return split;
  }

  private async recalculatePendingPlayers(splitId: string) {
    const split = await this.prisma.bookingSplit.findUnique({
      where: { id: splitId },
      include: { players: { orderBy: { createdAt: 'asc' } } },
    });

    if (!split) return;

    const players = split.players;
    const paidPlayers = players.filter(
      (p) => p.status === SplitPlayerStatus.PAID,
    );
    const pendingPlayers = players.filter(
      (p) => p.status === SplitPlayerStatus.PENDING,
    );

    if (pendingPlayers.length === 0) return;

    const paidAmount = paidPlayers.reduce((sum, p) => sum + p.amount, 0);
    const remainingAmount = split.totalAmount - paidAmount;

    // Integer division
    const baseAmount = Math.floor(remainingAmount / pendingPlayers.length);
    const remainder = Math.floor(remainingAmount % pendingPlayers.length);

    const updates: any[] = [];
    for (let i = 0; i < pendingPlayers.length; i++) {
      const p = pendingPlayers[i];
      const newAmount =
        baseAmount + (i === pendingPlayers.length - 1 ? remainder : 0);
      if (p.amount !== newAmount) {
        updates.push(
          this.prisma.bookingSplitPlayer.update({
            where: { id: p.id },
            data: { amount: newAmount },
          }),
        );
      }
    }

    if (updates.length > 0) {
      await this.prisma.$transaction(updates);
    }
  }

  async addPlayers(
    authId: string,
    bookingId: string,
    dto: AddPlayersDto,
    ip: string,
  ) {
    await this.rateLimiter.check(`user:${authId}:split:addPlayers`, {
      limit: 15,
      windowMs: 60000,
    });

    const booking = await this.verifyOwnershipAndGetBooking(authId, bookingId);
    const split = await this.getOrCreateSplit(
      bookingId,
      authId,
      booking.amount,
    );

    if (split.isSplitDone) {
      throw new BadRequestException(
        'Cannot add players after split is triggered',
      );
    }

    const usernames = Array.from(new Set(dto.usernames));
    const existingUsernames = new Set(split.players.map((p) => p.username));
    const newUsernames = usernames.filter((u) => !existingUsernames.has(u));

    if (newUsernames.length > 0) {
      // 1. Fetch user profiles in one single query (Fixes N+1 issue)
      const userProfiles = await this.prisma.userProfile.findMany({
        where: { username: { in: newUsernames } },
        select: { username: true, authId: true },
      });
      const profileMap = new Map(
        userProfiles.map((p) => [p.username, p.authId]),
      );

      // 2. Bulk insert new players
      await this.prisma.bookingSplitPlayer.createMany({
        data: newUsernames.map((username) => ({
          splitId: split.id,
          username,
          userId: profileMap.get(username) || null,
          amount: 0,
        })),
      });

      // 3. Recalculate based on newly added array securely
      await this.recalculatePendingPlayers(split.id);

      // ─── PUSH NOTIFICATION LOGIC ───
      // Determine which of the newly added players are registered users to notify them
      const notifiablePlayers = await this.prisma.bookingSplitPlayer.findMany({
        where: {
          splitId: split.id,
          username: { in: newUsernames },
          userId: { not: null },
        },
      });

      if (notifiablePlayers.length > 0) {
        const leadProfile = await this.prisma.userProfile.findUnique({
          where: { authId },
          select: { name: true, username: true },
        });
        const turfInfo = await this.prisma.turf.findUnique({
          where: { id: booking.turfId },
          select: { name: true },
        });

        const leadName =
          leadProfile?.name || leadProfile?.username || 'Team Lead';
        const turfName = turfInfo?.name || 'the turf';

        for (const player of notifiablePlayers) {
          if (player.userId) {
            this.triggerPushNotification(
              player.userId,
              'Added to Split 👥',
              `You were added to a split for ${turfName} by ${leadName}`,
              {
                type: 'SPLIT_ADDED',
                bookingId,
              },
            );
          }
        }
      }
    }

    await this.cache.invalidate(`split:${bookingId}`);

    this.paymentLogger.log({
      userId: authId,
      bookingId: bookingId,
      turfId: booking.turfId,
      action: 'split-add-players',
      amount: 0,
      ip,
      result: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Players added to split',
      data: null,
    };
  }

  async removePlayer(authId: string, playerId: string, ip: string) {
    const player = await this.prisma.bookingSplitPlayer.findUnique({
      where: { id: playerId },
      include: { split: true },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    const bookingId = player.split.bookingId;
    await this.rateLimiter.check(`user:${authId}:split:removePlayer`, {
      limit: 15,
      windowMs: 60000,
    });

    const booking = await this.verifyOwnershipAndGetBooking(authId, bookingId);
    const split = await this.getOrCreateSplit(
      bookingId,
      authId,
      booking.amount,
    );

    if (player.status === SplitPlayerStatus.PAID) {
      throw new BadRequestException(
        'Cannot remove a player who has already paid',
      );
    }

    await this.prisma.bookingSplitPlayer.delete({
      where: { id: playerId },
    });

    await this.recalculatePendingPlayers(split.id);

    await this.cache.invalidate(`split:${bookingId}`);

    this.paymentLogger.log({
      userId: authId,
      bookingId: bookingId,
      turfId: booking.turfId,
      action: 'split-remove-player',
      amount: 0,
      ip,
      result: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Player removed from split',
      data: null,
    };
  }

  async triggerSplit(authId: string, bookingId: string, ip: string) {
    await this.rateLimiter.check(`user:${authId}:split:trigger`, {
      limit: 5,
      windowMs: 60000,
    });

    const booking = await this.verifyOwnershipAndGetBooking(authId, bookingId);
    let split = await this.getOrCreateSplit(bookingId, authId, booking.amount);

    if (split.players.length === 0) {
      throw new BadRequestException('No players added to the split yet');
    }

    // Check if total amount is correctly distributed before finalizing
    const totalAssigned = split.players.reduce((sum, p) => sum + p.amount, 0);
    if (totalAssigned !== split.totalAmount) {
      await this.recalculatePendingPlayers(split.id);
    }

    split = await this.prisma.bookingSplit.update({
      where: { id: split.id },
      data: { isSplitDone: true },
      include: { players: true },
    });

    // ── Push Notification (Payment Required for All) ──
    if (split.players && split.players.length > 0) {
      const leadProfile = await this.prisma.userProfile.findUnique({
        where: { authId },
        select: { name: true, username: true },
      });
      const turfInfo = await this.prisma.turf.findUnique({
        where: { id: booking.turfId },
        select: { name: true },
      });

      const leadName =
        leadProfile?.name || leadProfile?.username || 'Team Lead';
      const turfName = turfInfo?.name || 'the turf';

      split.players.forEach((p) => {
        if (p.userId && p.amount > 0) {
          this.triggerPushNotification(
            p.userId,
            'Payment Required 💸',
            `You need to pay ₹${p.amount} to ${leadName} for ${turfName}. See details.`,
            {
              type: 'SPLIT_PAYMENT',
              bookingId,
              amount: p.amount,
            },
          );
        }
      });
    }

    await this.cache.invalidate(`split:${bookingId}`);

    this.paymentLogger.log({
      userId: authId,
      bookingId: bookingId,
      turfId: booking.turfId,
      action: 'split-trigger',
      amount: split.totalAmount,
      ip,
      result: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Split triggered and finalized',
      data: null,
    };
  }

  async setCustomAmounts(
    authId: string,
    bookingId: string,
    dto: SetAmountsDto,
    ip: string,
  ) {
    await this.rateLimiter.check(`user:${authId}:split:setCustom`, {
      limit: 15,
      windowMs: 60000,
    });

    const booking = await this.verifyOwnershipAndGetBooking(authId, bookingId);
    const split = await this.getOrCreateSplit(
      bookingId,
      authId,
      booking.amount,
    );

    if (split.isSplitDone) {
      throw new BadRequestException(
        'Cannot set custom amounts after split is confirmed',
      );
    }

    const proposedSum = dto.amounts.reduce((sum, a) => sum + a.amount, 0);
    if (proposedSum !== split.totalAmount) {
      throw new BadRequestException(
        `Total split amount (${proposedSum}) must equal booking amount (${split.totalAmount})`,
      );
    }

    // Verify all player IDs exist in this split
    const splitPlayerIds = split.players.map((p) => p.id);
    for (const item of dto.amounts) {
      if (!splitPlayerIds.includes(item.playerId)) {
        throw new BadRequestException(
          `Player ${item.playerId} is not part of this split`,
        );
      }
    }

    // Update amounts
    await this.prisma.$transaction(
      dto.amounts.map((item) =>
        this.prisma.bookingSplitPlayer.update({
          where: { id: item.playerId },
          data: { amount: item.amount },
        }),
      ),
    );

    await this.cache.invalidate(`split:${bookingId}`);

    return {
      success: true,
      message: 'Custom split amounts saved',
      data: null,
    };
  }

  async updatePlayerStatus(
    authId: string,
    playerId: string,
    status: SplitPlayerStatus,
    ip: string,
  ) {
    const player = await this.prisma.bookingSplitPlayer.findUnique({
      where: { id: playerId },
      include: { split: true },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    const bookingId = player.split.bookingId;
    await this.rateLimiter.check(`user:${authId}:split:updateStatus`, {
      limit: 15,
      windowMs: 60000,
    });

    const booking = await this.verifyOwnershipAndGetBooking(authId, bookingId);
    const split = await this.getOrCreateSplit(
      bookingId,
      authId,
      booking.amount,
    );

    await this.prisma.bookingSplitPlayer.update({
      where: { id: playerId },
      data: { status },
    });

    // ── Push Notification (Payment Marked Paid) ──
    if (status === SplitPlayerStatus.PAID && player.userId) {
      this.triggerPushNotification(
        player.userId,
        'You are settled! ✅',
        'Your split payment has been marked as paid. All set!',
        {
          type: 'SPLIT_PAID',
          bookingId,
        },
      );
    }

    if (split.isSplitDone) {
      await this.recalculatePendingPlayers(split.id);
    }

    await this.cache.invalidate(`split:${bookingId}`);

    this.paymentLogger.log({
      userId: authId,
      bookingId: bookingId,
      turfId: booking.turfId,
      action: 'split-update-status',
      amount: player.amount,
      ip,
      result: 'SUCCESS',
    });

    return {
      success: true,
      message: `Player status updated to ${status}`,
      data: null,
    };
  }

  async getSplitDetails(authId: string, bookingId: string) {
    await this.rateLimiter.check(`user:${authId}:split:get`, {
      limit: 60,
      windowMs: 60000,
    });
    const booking = await this.verifyOwnershipAndGetBooking(authId, bookingId);

    return this.cache.getOrSet(
      `split:${bookingId}`,
      async () => {
        const split = await this.getOrCreateSplit(
          bookingId,
          authId,
          booking.amount,
        );

        const players = split.players.map((p) => {
          const { userId, ...playerData } = p;
          return {
            ...playerData,
            isNotifiable: !!userId,
          };
        });

        const { ...splitData } = split;
        return {
          success: true,
          message: 'Split details fetched',
          data: {
            ...splitData,
            players,
          },
        };
      },
      1000 * 60 * 2, // 120 seconds TTL
    );
  }

  private async triggerPushNotification(
    userId: string,
    title: string,
    body: string,
    data: any,
  ) {
    try {
      this.notificationsService
        .sendNotification(userId, title, body, data)
        .catch(() => {});
    } catch (error) {
      this.logger.error(`[NOTIFICATION_TRIGGER_ERROR] ${error.message}`);
    }
  }
}
