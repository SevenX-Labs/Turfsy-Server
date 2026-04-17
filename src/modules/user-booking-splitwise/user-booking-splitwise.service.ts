import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/services/cache.service';
import { RateLimiterService } from '../../common/services/rate-limiter.service';
import { PaymentLoggerService } from '../../common/services/payment-logger.service';
import { AddPlayersDto } from './dto/add-players.dto';
import { SetAmountsDto } from './dto/set-amounts.dto';
import { SplitPlayerStatus } from '@prisma/client';

@Injectable()
export class UserBookingSplitwiseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly rateLimiter: RateLimiterService,
    private readonly paymentLogger: PaymentLoggerService,
  ) {}

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
      throw new ForbiddenException('You are not authorized to manage this split');
    }
    return booking;
  }

  private async getOrCreateSplit(bookingId: string, authId: string, amount: number) {
    let split = await this.prisma.bookingSplit.findUnique({
      where: { bookingId },
      include: { players: true },
    });

    if (!split) {
      split = await this.prisma.bookingSplit.create({
        data: {
          bookingId,
          leadUserId: authId,
          totalAmount: amount,
        },
        include: { players: true },
      });
    } else if (split.leadUserId !== authId) {
      throw new ForbiddenException('Access denied.');
    }
    return split;
  }

  private async recalculatePendingPlayers(splitId: string) {
    const split = await this.prisma.bookingSplit.findUnique({
      where: { id: splitId },
      include: { players: { orderBy: { createdAt: 'asc' } } },
    });

    if (!split) return;

    const players = split.players;
    const paidPlayers = players.filter((p) => p.status === SplitPlayerStatus.PAID);
    const pendingPlayers = players.filter((p) => p.status === SplitPlayerStatus.PENDING);

    if (pendingPlayers.length === 0) return;

    const paidAmount = paidPlayers.reduce((sum, p) => sum + p.amount, 0);
    const remainingAmount = split.totalAmount - paidAmount;

    // Integer division
    const baseAmount = Math.floor(remainingAmount / pendingPlayers.length);
    const remainder = Math.floor(remainingAmount % pendingPlayers.length);

    const updates: any[] = [];
    for (let i = 0; i < pendingPlayers.length; i++) {
        const p = pendingPlayers[i];
        const newAmount = baseAmount + (i === pendingPlayers.length - 1 ? remainder : 0);
        if (p.amount !== newAmount) {
            updates.push(
               this.prisma.bookingSplitPlayer.update({
                  where: { id: p.id },
                  data: { amount: newAmount },
               })
            );
        }
    }
    
    if (updates.length > 0) {
      await this.prisma.$transaction(updates);
    }
  }

  async addPlayers(authId: string, bookingId: string, dto: AddPlayersDto, ip: string) {
    this.rateLimiter.check(`user:${authId}:split:addPlayers`, { limit: 15, windowMs: 60000 });

    const booking = await this.verifyOwnershipAndGetBooking(authId, bookingId);
    const split = await this.getOrCreateSplit(bookingId, authId, booking.amount);

    if (split.isSplitDone) {
      throw new BadRequestException('Cannot add players after split is triggered');
    }

    const usernames = Array.from(new Set(dto.usernames));
    const existingUsernames = new Set(split.players.map(p => p.username));
    const newUsernames = usernames.filter(u => !existingUsernames.has(u));

    if (newUsernames.length > 0) {
      // 1. Fetch user profiles in one single query (Fixes N+1 issue)
      const userProfiles = await this.prisma.userProfile.findMany({
        where: { username: { in: newUsernames } },
        select: { username: true, authId: true }
      });
      const profileMap = new Map(userProfiles.map(p => [p.username, p.authId]));

      // 2. Bulk insert new players
      await this.prisma.bookingSplitPlayer.createMany({
        data: newUsernames.map(username => ({
          splitId: split.id,
          username,
          userId: profileMap.get(username) || null,
          amount: 0,
        }))
      });

      // 3. Recalculate based on newly added array securely
      await this.recalculatePendingPlayers(split.id);
    }

    this.cache.invalidate(`split:${bookingId}`);

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
    this.rateLimiter.check(`user:${authId}:split:removePlayer`, { limit: 15, windowMs: 60000 });

    const booking = await this.verifyOwnershipAndGetBooking(authId, bookingId);
    const split = await this.getOrCreateSplit(bookingId, authId, booking.amount);

    if (player.status === SplitPlayerStatus.PAID) {
      throw new BadRequestException('Cannot remove a player who has already paid');
    }

    await this.prisma.bookingSplitPlayer.delete({
      where: { id: playerId },
    });

    await this.recalculatePendingPlayers(split.id);

    this.cache.invalidate(`split:${bookingId}`);

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
    this.rateLimiter.check(`user:${authId}:split:trigger`, { limit: 5, windowMs: 60000 });

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

    this.cache.invalidate(`split:${bookingId}`);

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

  async setCustomAmounts(authId: string, bookingId: string, dto: SetAmountsDto, ip: string) {
    this.rateLimiter.check(`user:${authId}:split:setCustom`, { limit: 15, windowMs: 60000 });

    const booking = await this.verifyOwnershipAndGetBooking(authId, bookingId);
    const split = await this.getOrCreateSplit(bookingId, authId, booking.amount);

    if (split.isSplitDone) {
      throw new BadRequestException('Cannot set custom amounts after split is confirmed');
    }

    const proposedSum = dto.amounts.reduce((sum, a) => sum + a.amount, 0);
    if (proposedSum !== split.totalAmount) {
      throw new BadRequestException(`Total split amount (${proposedSum}) must equal booking amount (${split.totalAmount})`);
    }

    // Verify all player IDs exist in this split
    const splitPlayerIds = split.players.map(p => p.id);
    for (const item of dto.amounts) {
      if (!splitPlayerIds.includes(item.playerId)) {
         throw new BadRequestException(`Player ${item.playerId} is not part of this split`);
      }
    }

    // Update amounts
    await this.prisma.$transaction(
      dto.amounts.map(item =>
        this.prisma.bookingSplitPlayer.update({
          where: { id: item.playerId },
          data: { amount: item.amount }
        })
      )
    );

    this.cache.invalidate(`split:${bookingId}`);

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
    ip: string
  ) {
    const player = await this.prisma.bookingSplitPlayer.findUnique({
      where: { id: playerId },
      include: { split: true },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    const bookingId = player.split.bookingId;
    this.rateLimiter.check(`user:${authId}:split:updateStatus`, { limit: 15, windowMs: 60000 });

    const booking = await this.verifyOwnershipAndGetBooking(authId, bookingId);
    const split = await this.getOrCreateSplit(bookingId, authId, booking.amount);

    await this.prisma.bookingSplitPlayer.update({
      where: { id: playerId },
      data: { status },
    });

    if (split.isSplitDone) {
      await this.recalculatePendingPlayers(split.id);
    }

    this.cache.invalidate(`split:${bookingId}`);

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
    this.rateLimiter.check(`user:${authId}:split:get`, { limit: 60, windowMs: 60000 });
    const booking = await this.verifyOwnershipAndGetBooking(authId, bookingId);

    return this.cache.getOrSet(
      `split:${bookingId}`,
      async () => {
        const split = await this.getOrCreateSplit(bookingId, authId, booking.amount);
        
        const players = split.players.map(p => {
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
}
