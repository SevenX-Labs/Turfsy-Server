import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // Basic Metrics
    const totalUsers = await this.prisma.auth.count({ where: { role: 'USER' } });
    const totalOwners = await this.prisma.auth.count({ where: { role: 'OWNER' } });
    const totalTurfs = await this.prisma.turf.count({ where: { deletedAt: null } });

    // Active Bookings (CONFIRMED or PENDING_APPROVAL)
    const activeBookings = await this.prisma.booking.count({
      where: {
        bookingStatus: { in: ['CONFIRMED', 'PENDING_APPROVAL'] },
      },
    });

    // Today's Bookings
    const todayBookings = await this.prisma.booking.count({
      where: {
        bookingDate: { gte: startOfToday, lte: endOfToday },
      },
    });

    // Today's Revenue (confirmed or completed today)
    const todayRevenueSum = await this.prisma.booking.aggregate({
      where: {
        bookingStatus: { in: ['CONFIRMED', 'COMPLETED'] },
        bookingDate: { gte: startOfToday, lte: endOfToday },
      },
      _sum: {
        amount: true,
      },
    });
    const todayRevenue = todayRevenueSum._sum.amount || 0;

    // Platform Fee Earned
    const todayPlatformFeeSum = await this.prisma.booking.aggregate({
      where: {
        bookingStatus: { in: ['CONFIRMED', 'COMPLETED'] },
        bookingDate: { gte: startOfToday, lte: endOfToday },
      },
      _sum: {
        platformFee: true,
      },
    });
    const platformFeeEarned = todayPlatformFeeSum._sum.platformFee || 0;

    // Settlements
    const pendingSettlementsSum = await this.prisma.settlement.aggregate({
      where: { status: 'PENDING' },
      _sum: { amount: true },
    });
    const pendingSettlements = pendingSettlementsSum._sum.amount || 0;

    const completedSettlementsSum = await this.prisma.settlement.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { amount: true },
    });
    const completedSettlements = completedSettlementsSum._sum.amount || 0;

    // Open Support Tickets
    const openSupportTickets = await this.prisma.supportTicket.count({
      where: { status: 'OPEN' },
    });

    // Pending Manual Booking Approvals
    const pendingManualApprovals = await this.prisma.booking.count({
      where: { bookingStatus: 'PENDING_APPROVAL' },
    });

    // Recent Activity (combined log and new bookings)
    const recentLogs = await this.prisma.adminActionLog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { admin: { select: { name: true } } },
    });

    const recentBookings = await this.prisma.booking.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { phone: true } },
        turf: { select: { name: true } },
      },
    });

    // Past 7 Days Chart Data
    const chartData: any[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

      const dayRevenue = await this.prisma.booking.aggregate({
        where: {
          bookingStatus: { in: ['CONFIRMED', 'COMPLETED'] },
          bookingDate: { gte: start, lte: end },
        },
        _sum: { amount: true },
      });

      const dayBookings = await this.prisma.booking.count({
        where: {
          bookingDate: { gte: start, lte: end },
        },
      });

      const dayUsers = await this.prisma.auth.count({
        where: {
          role: 'USER',
          createdAt: { gte: start, lte: end },
        },
      });

      chartData.push({
        date: start.toISOString().split('T')[0],
        revenue: dayRevenue._sum.amount || 0,
        bookings: dayBookings,
        users: dayUsers,
      });
    }

    return {
      success: true,
      data: {
        stats: {
          totalUsers,
          totalOwners,
          totalTurfs,
          activeBookings,
          todayBookings,
          todayRevenue,
          platformFeeEarned,
          pendingSettlements,
          completedSettlements,
          openSupportTickets,
          pendingManualApprovals,
        },
        recentActivity: {
          logs: recentLogs,
          bookings: recentBookings,
        },
        charts: chartData,
      },
    };
  }

  async getRevenueStats() {
    const now = new Date();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const startOfWeek = new Date();
    startOfWeek.setDate(now.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(now.getDate() - 30);
    startOfMonth.setHours(0, 0, 0, 0);

    const [todayAgg, weeklyAgg, monthlyAgg, pendingAgg] = await Promise.all([
      this.prisma.booking.aggregate({
        where: {
          bookingStatus: { in: ['CONFIRMED', 'COMPLETED'] },
          bookingDate: { gte: startOfToday, lte: endOfToday },
        },
        _sum: { amount: true, platformFee: true },
      }),
      this.prisma.booking.aggregate({
        where: {
          bookingStatus: { in: ['CONFIRMED', 'COMPLETED'] },
          bookingDate: { gte: startOfWeek },
        },
        _sum: { amount: true, platformFee: true },
      }),
      this.prisma.booking.aggregate({
        where: {
          bookingStatus: { in: ['CONFIRMED', 'COMPLETED'] },
          bookingDate: { gte: startOfMonth },
        },
        _sum: { amount: true, platformFee: true },
      }),
      this.prisma.settlement.aggregate({
        where: { status: 'PENDING' },
        _sum: { amount: true },
      }),
    ]);

    return {
      success: true,
      data: {
        todayRevenue: todayAgg._sum.amount || 0,
        weeklyRevenue: weeklyAgg._sum.amount || 0,
        monthlyRevenue: monthlyAgg._sum.amount || 0,
        platformFeeEarned: todayAgg._sum.platformFee || 0,
        totalPlatformFeeWeekly: weeklyAgg._sum.platformFee || 0,
        totalPlatformFeeMonthly: monthlyAgg._sum.platformFee || 0,
        pendingSettlementAmount: pendingAgg._sum.amount || 0,
      },
    };
  }

  async getChartData() {
    // 1. Last 7 Days Booking Chart
    const bookingChart: any[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      const count = await this.prisma.booking.count({
        where: { bookingDate: { gte: start, lte: end } },
      });
      bookingChart.push({
        date: start.toISOString().split('T')[0],
        bookings: count,
      });
    }

    // 2. Last 30 Days Revenue Chart
    const revenueChart: any[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      const agg = await this.prisma.booking.aggregate({
        where: {
          bookingStatus: { in: ['CONFIRMED', 'COMPLETED'] },
          bookingDate: { gte: start, lte: end },
        },
        _sum: { amount: true },
      });
      revenueChart.push({
        date: start.toISOString().split('T')[0],
        revenue: agg._sum.amount || 0,
      });
    }

    // 3. User & Owner Growth (past 30 days cumulative)
    const userGrowth: any[] = [];
    const ownerGrowth: any[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

      const userCount = await this.prisma.auth.count({
        where: { role: 'USER', createdAt: { lte: end } },
      });
      const ownerCount = await this.prisma.auth.count({
        where: { role: 'OWNER', createdAt: { lte: end } },
      });
      userGrowth.push({
        date: start.toISOString().split('T')[0],
        count: userCount,
      });
      ownerGrowth.push({
        date: start.toISOString().split('T')[0],
        count: ownerCount,
      });
    }

    return {
      success: true,
      data: {
        bookingChart,
        revenueChart,
        userGrowth,
        ownerGrowth,
      },
    };
  }

  async getRecentBookings(query: { page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const [total, bookings] = await Promise.all([
      this.prisma.booking.count(),
      this.prisma.booking.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { phone: true, userProfile: { select: { name: true } } },
          },
          turf: {
            select: { name: true, city: true },
          },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        bookings,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }
}
