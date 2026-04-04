import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UserGamificationService {
  constructor(private readonly prisma: PrismaService) {}

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
    const pointsToAdd = Math.floor(durationHours * 10);

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
      return gamification;
    }

    const now = new Date();
    const lastPlayed = gamification.lastPlayedDate;
    
    let newStreak = gamification.streak;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastDate = lastPlayed ? new Date(lastPlayed.getFullYear(), lastPlayed.getMonth(), lastPlayed.getDate()) : null;

    // Check if user already played today (limit streak increment to once per day)
    const alreadyPlayedToday = lastDate && lastDate.getTime() === today.getTime();

    if (!alreadyPlayedToday) {
      if (lastDate) {
        const diffTime = Math.abs(today.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 5) {
          // If user plays within 5 days → streak increases by +1
          newStreak += 1;
        } else {
          // If user does NOT play for more than 5 days → streak decreases by -1 (minimum 0)
          newStreak = Math.max(0, newStreak - 1);
        }
      } else {
        newStreak = 1;
      }
    }

    return await this.prisma.userGamification.update({
      where: { authId: userId },
      data: {
        streak: newStreak,
        points: { increment: pointsToAdd },
        totalMatches: { increment: 1 },
        totalHours: { increment: durationHours },
        lastPlayedDate: now,
      },
    });
  }

  async getOverallStats(userId: string) {
    const [gamification, leaderboard, nudge] = await Promise.all([
      this.getUserStats(userId),
      this.getLeaderboardFiltered('points'),
      this.getNudgeMessage(userId),
    ]);

    const userRank = await this.getUserRank(userId, 'points');

    return {
      streak: gamification?.streak || 0,
      points: gamification?.points || 0,
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

  async getLeaderboardFiltered(sortBy: 'points' | 'totalMatches' | 'totalHours') {
    const orderByField = sortBy === 'points' ? 'points' : sortBy === 'totalMatches' ? 'totalMatches' : 'totalHours';
    
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

  async getUserRank(userId: string, sortBy: 'points' | 'totalMatches' | 'totalHours' = 'points') {
    const userStats = await this.getUserStats(userId);
    if (!userStats) return null;

    const sortByField = sortBy === 'points' ? 'points' : sortBy === 'totalMatches' ? 'totalMatches' : 'totalHours';
    const value = userStats[sortByField];

    const count = await this.prisma.userGamification.count({
      where: {
        [sortByField]: { gt: value },
      },
    });

    return count + 1;
  }

  async getNudgeMessage(userId: string) {
    const stats = await this.getUserStats(userId);
    if (!stats) return 'Book your first game to start your streak! 🔥';

    const lastPlayed = stats.lastPlayedDate;
    const now = new Date();
    const isPlayedToday = lastPlayed && 
      lastPlayed.getDate() === now.getDate() && 
      lastPlayed.getMonth() === now.getMonth() && 
      lastPlayed.getFullYear() === now.getFullYear();

    if (!isPlayedToday) {
      return 'Play today to keep your streak 🔥';
    }

    const rank = await this.getUserRank(userId, 'points');
    if (rank && rank > 10) {
      return 'Play more to reach Top 10!';
    } else if (rank && rank > 3) {
      return 'You are close to the Top 3! Keep going! 🏆';
    }

    return 'Great job! You are among the top players! 🌟';
  }
}
