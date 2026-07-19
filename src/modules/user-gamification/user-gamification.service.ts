import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../common/notifications/notifications.service';

@Injectable()
export class UserGamificationService {
  private readonly logger = new Logger(UserGamificationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Handle booking completion logic
   * - Streak calculation (5-day rule)
   * - Points calculation (10 pts per hour)
   * - Update totals (matches and hours)
   */
  async handleBookingCompletion(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking || booking.bookingStatus !== 'COMPLETED') {
      return;
    }

    const durationHours = booking.durationMins / 60;
    const pointsToAdd = 10; // 10 pts per booking completion

    let gamification = await this.prisma.userGamification.findUnique({
      where: { authId: userId },
    });

    if (!gamification) {
      gamification = await this.prisma.userGamification.create({
        data: {
          authId: userId,
          streak: 1,
          points: pointsToAdd,
          totalMatches: 1,
          totalHours: durationHours,
          lastPlayedDate: new Date(),
        },
      });

      // ── Push Notification (New Gamification) ──
      this.triggerPushNotification(
        userId,
        'Level Up! 🌟',
        `You earned ${pointsToAdd} pts! Started your streak 🔥`,
        {
          type: 'GAMIFICATION_UPDATE',
          points: pointsToAdd,
          streak: 1,
        },
      );

      return gamification;
    }

    const now = new Date();
    const lastPlayed = gamification.lastPlayedDate;

    let newStreak = gamification.streak;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastDate = lastPlayed
      ? new Date(
          lastPlayed.getFullYear(),
          lastPlayed.getMonth(),
          lastPlayed.getDate(),
        )
      : null;

    // Check if user already played today (limit streak increment to once per day)
    const alreadyPlayedToday =
      lastDate && lastDate.getTime() === today.getTime();

    if (!alreadyPlayedToday) {
      if (lastDate) {
        const diffTime = Math.abs(today.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 5) {
          // If user plays within 5 days → streak increases by +1
          newStreak += 1;
        } else {
          // If user does NOT play for more than 5 days → streak resets to 1 (starting new)
          newStreak = 1;
        }
      } else {
        newStreak = 1;
      }
    }

    const result = await this.prisma.userGamification.update({
      where: { authId: userId },
      data: {
        streak: newStreak,
        points: { increment: pointsToAdd },
        totalMatches: { increment: 1 },
        totalHours: { increment: durationHours },
        lastPlayedDate: now,
      },
    });

    // ── Push Notification (Gamification Update) ──
    this.triggerPushNotification(
      userId,
      'Game Completed! 🏆',
      `You earned ${pointsToAdd} pts! Current streak: ${newStreak} 🔥`,
      {
        type: 'GAMIFICATION_UPDATE',
        points: pointsToAdd,
        streak: newStreak,
      },
    );

    return result;
  }

  async getOverallStats(userId: string) {
    const gamification = await this.getUserStats(userId);
    const [leaderboard, nudge] = await Promise.all([
      this.getLeaderboardFiltered('points'),
      this.getNudgeMessage(userId, gamification),
    ]);

    const userRank = await this.getUserRank(userId, 'points', gamification);

    // Calculate effective streak for display (show 0 if expired)
    let effectiveStreak = gamification?.streak || 0;
    if (gamification?.lastPlayedDate) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const lastPlayed = gamification.lastPlayedDate;
      const lastDate = new Date(
        lastPlayed.getFullYear(),
        lastPlayed.getMonth(),
        lastPlayed.getDate(),
      );

      const diffTime = Math.abs(today.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 5) {
        effectiveStreak = 0;
      }
    }

    return {
      streak: effectiveStreak,
      points: gamification?.points || 0,
      totalMatches: gamification?.totalMatches || 0,
      totalHours: gamification?.totalHours || 0,
      leaderboard: {
        top10: leaderboard,
        currentUser: {
          rank: userRank,
          name: 'You',
          points: gamification?.points || 0,
        },
      },
      nudge,
    };
  }

  async getUserStats(userId: string) {
    return await this.prisma.userGamification.findUnique({
      where: { authId: userId },
    });
  }

  async getLeaderboardFiltered(
    sortBy: 'points' | 'totalMatches' | 'totalHours',
  ) {
    const orderByField =
      sortBy === 'points'
        ? 'points'
        : sortBy === 'totalMatches'
          ? 'totalMatches'
          : 'totalHours';

    const users = await this.prisma.userGamification.findMany({
      take: 10,
      orderBy: { [orderByField]: 'desc' },
      include: {
        auth: {
          include: {
            userProfile: { select: { name: true } },
          },
        },
      },
    });

    return users.map((u) => ({
      name: u.auth.userProfile?.name || 'Anonymous',
      [sortBy]: u[orderByField],
      points: u.points, // Include points always for basic leaderboard display
    }));
  }

  async getUserRank(
    userId: string,
    sortBy: 'points' | 'totalMatches' | 'totalHours' = 'points',
    prefetchedStats?: any,
  ) {
    const userStats = prefetchedStats || (await this.getUserStats(userId));
    if (!userStats) return null;

    const sortByField =
      sortBy === 'points'
        ? 'points'
        : sortBy === 'totalMatches'
          ? 'totalMatches'
          : 'totalHours';
    const value = userStats[sortByField];

    const count = await this.prisma.userGamification.count({
      where: {
        [sortByField]: { gt: value },
      },
    });

    return count + 1;
  }

  async getNudgeMessage(userId: string, prefetchedStats?: any) {
    const stats = prefetchedStats || (await this.getUserStats(userId));
    if (!stats) return 'Book your first game to start your streak! 🔥';

    const lastPlayed = stats.lastPlayedDate;
    const now = new Date();
    const isPlayedToday =
      lastPlayed &&
      lastPlayed.getDate() === now.getDate() &&
      lastPlayed.getMonth() === now.getMonth() &&
      lastPlayed.getFullYear() === now.getFullYear();

    if (!isPlayedToday) {
      return 'Play today to keep your streak 🔥';
    }

    const rank = await this.getUserRank(userId, 'points', stats);
    if (rank && rank > 10) {
      return 'Play more to reach Top 10!';
    } else if (rank && rank > 3) {
      return 'You are close to the Top 3! Keep going! 🏆';
    }

    return 'Great job! You are among the top players! 🌟';
  }

  async handleNoShow(userId: string, bookingId: string) {
    const pointsToDeduct = 30; // 30 pts penalty

    const result = await this.prisma.userGamification.upsert({
      where: { authId: userId },
      create: {
        authId: userId,
        streak: 0,
        points: -pointsToDeduct,
        totalMatches: 0,
        totalHours: 0,
        lastPlayedDate: new Date(),
      },
      update: {
        streak: 0,
        points: { decrement: pointsToDeduct },
      },
    });

    // ── Push Notification (Penalty) ──
    this.triggerPushNotification(
      userId,
      'Booking Missed 😞',
      `Points deducted (-${pointsToDeduct} pts) and streak broken. Don't miss your next game!`,
      {
        type: 'GAMIFICATION_PENALTY',
        pointsDeducted: pointsToDeduct,
        streak: 0,
      },
    );

    return result;
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
      this.logger.error(`[GAMIFICATION_NOTIFICATION_ERROR] ${error.message}`);
    }
  }
}
