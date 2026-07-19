import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BookingStatus, PaymentStatus, PaymentType } from '@prisma/client';

@Injectable()
export class OwnerHomeService {
  constructor(private prisma: PrismaService) {}

  private async getOwnerData(ownerAuthId: string) {
    const owner = await this.prisma.ownerProfile.findUnique({
      where: { authId: ownerAuthId },
      include: { turfs: { select: { id: true, name: true } } },
    });
    if (!owner) throw new NotFoundException('Owner profile not found');
    const turfIds = owner.turfs.map((t) => t.id);
    const bookings = await this.prisma.booking.findMany({
      where: { turfId: { in: turfIds } },
      include: {
        turf: { select: { name: true, sportsType: true } },
        user: {
          select: {
            phone: true,
            userProfile: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
    return { owner, bookings };
  }

  // 1. Revenue Summary
  async getRevenueSummary(ownerAuthId: string) {
    const { bookings } = await this.getOwnerData(ownerAuthId);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const revenueToday = bookings
      .filter(
        (b) =>
          b.bookingDate.toISOString().split('T')[0] === today &&
          (b.bookingStatus === 'COMPLETED' || b.paymentStatus === 'SUCCESS'),
      )
      .reduce((sum, b) => sum + b.amount, 0);

    const revenueMonth = bookings
      .filter(
        (b) =>
          b.bookingDate >= firstOfMonth &&
          (b.bookingStatus === 'COMPLETED' || b.paymentStatus === 'SUCCESS'),
      )
      .reduce((sum, b) => sum + b.amount, 0);

    return {
      success: true,
      data: { today: revenueToday, month: revenueMonth, currency: 'INR' },
    };
  }

  // 2. Booking Statistics
  async getBookingStatistics(ownerAuthId: string) {
    const { bookings } = await this.getOwnerData(ownerAuthId);
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const counts = {
      total: bookings.length,
      today: bookings.filter(
        (b) => b.bookingDate.toISOString().split('T')[0] === today,
      ).length,
      upcoming: bookings.filter(
        (b) => b.bookingDate >= new Date() && b.bookingStatus === 'CONFIRMED',
      ).length,
      completed: bookings.filter((b) => b.bookingStatus === 'COMPLETED').length,
      cancelled: bookings.filter((b) => b.bookingStatus === 'CANCELLED').length,
      noShow: bookings.filter((b) => b.bookingStatus === 'NO_SHOW').length,
    };

    return { success: true, data: counts };
  }

  // 3. Recent Activity
  async getRecentActivity(ownerAuthId: string, limit = 10) {
    const { owner } = await this.getOwnerData(ownerAuthId);
    const bookings = await this.prisma.booking.findMany({
      where: { turfId: { in: owner.turfs.map((t) => t.id) } },
      include: { turf: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      success: true,
      data: bookings.map((b) => ({
        id: b.id,
        displayId: `TRF-${b.id.slice(0, 7).toUpperCase()}`,
        turfName: b.turf.name,
        amount: b.amount,
        status: b.bookingStatus,
        playersCount: (b as any).playersCount,
        createdAt: b.createdAt,
      })),
    };
  }

  // 4. Revenue Trends (7 Days)
  async getTrends(ownerAuthId: string) {
    const { bookings } = await this.getOwnerData(ownerAuthId);
    const trends = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toISOString().split('T')[0];
      const revenue = bookings
        .filter(
          (b) =>
            b.bookingDate.toISOString().split('T')[0] === dateStr &&
            b.bookingStatus === 'COMPLETED',
        )
        .reduce((sum, b) => sum + b.amount, 0);
      const count = bookings.filter(
        (b) => b.bookingDate.toISOString().split('T')[0] === dateStr,
      ).length;
      return { date: dateStr, revenue, count };
    });

    return { success: true, data: trends };
  }

  // 5. Payment Distribution
  async getPaymentDistribution(ownerAuthId: string) {
    const { bookings } = await this.getOwnerData(ownerAuthId);
    const online = bookings.filter(
      (b) => b.paymentType === PaymentType.FULL_ONLINE,
    ).length;
    const cash = bookings.filter(
      (b) =>
        b.paymentType === PaymentType.HALF_ONLINE_HALF_CASH ||
        b.paymentType === PaymentType.FULL_CASH,
    ).length;

    return {
      success: true,
      data: {
        online: {
          count: online,
          percentage: bookings.length
            ? ((online / bookings.length) * 100).toFixed(1)
            : 0,
        },
        cash: {
          count: cash,
          percentage: bookings.length
            ? ((cash / bookings.length) * 100).toFixed(1)
            : 0,
        },
      },
    };
  }

  // 6. Turf Performance
  async getTurfPerformance(ownerAuthId: string) {
    const { owner, bookings } = await this.getOwnerData(ownerAuthId);
    const stats = owner.turfs.map((turf) => {
      const turfBookings = bookings.filter((b) => b.turfId === turf.id);
      const revenue = turfBookings
        .filter((b) => b.bookingStatus === 'COMPLETED')
        .reduce((sum, b) => sum + b.amount, 0);
      return {
        id: turf.id,
        name: turf.name,
        totalBookings: turfBookings.length,
        revenue,
      };
    });

    return { success: true, data: stats.sort((a, b) => b.revenue - a.revenue) };
  }

  async getDashboardStats(ownerAuthId: string) {
    const { owner, bookings } = await this.getOwnerData(ownerAuthId);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Revenue Calculations
    const revenueToday = bookings
      .filter(
        (b) =>
          b.bookingDate.toISOString().split('T')[0] === today &&
          (b.bookingStatus === 'COMPLETED' || b.paymentStatus === 'SUCCESS'),
      )
      .reduce((sum, b) => sum + b.amount, 0);

    const revenueMonth = bookings
      .filter(
        (b) =>
          b.bookingDate >= firstOfMonth &&
          (b.bookingStatus === 'COMPLETED' || b.paymentStatus === 'SUCCESS'),
      )
      .reduce((sum, b) => sum + b.amount, 0);

    const revenueOverall = bookings
      .filter(
        (b) => b.bookingStatus === 'COMPLETED' || b.paymentStatus === 'SUCCESS',
      )
      .reduce((sum, b) => sum + b.amount, 0);

    // 2. Booking Counts
    const bookingsTotal = bookings.length;
    const bookingsToday = bookings.filter(
      (b) => b.bookingDate.toISOString().split('T')[0] === today,
    ).length;
    const bookingsUpcoming = bookings.filter(
      (b) => b.bookingDate >= new Date() && b.bookingStatus === 'CONFIRMED',
    ).length;
    const bookingsCompleted = bookings.filter(
      (b) => b.bookingStatus === 'COMPLETED',
    ).length;
    const bookingsCancelled = bookings.filter(
      (b) => b.bookingStatus === 'CANCELLED',
    ).length;
    const bookingsNoShow = bookings.filter(
      (b) => b.bookingStatus === 'NO_SHOW',
    ).length;
    const bookingsPending = bookings.filter(
      (b) => b.bookingStatus === 'PENDING_APPROVAL',
    ).length;

    // 3. Quick Stats
    const completedBookingsList = bookings.filter(
      (b) => b.bookingStatus === 'COMPLETED',
    );
    const avgBookingValue = completedBookingsList.length
      ? Math.round(
          completedBookingsList.reduce((sum, b) => sum + b.amount, 0) /
            completedBookingsList.length,
        )
      : 0;
    const cancellationRate = bookingsTotal
      ? `${((bookingsCancelled / bookingsTotal) * 100).toFixed(1)}%`
      : '0%';

    // 4. Trends - Revenue Chart (7 Days)
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const revenueChart = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = weekdays[d.getDay()];
      const revenue = bookings
        .filter(
          (b) =>
            b.bookingDate.toISOString().split('T')[0] === dateStr &&
            (b.bookingStatus === 'COMPLETED' || b.paymentStatus === 'SUCCESS'),
        )
        .reduce((sum, b) => sum + b.amount, 0);
      return { label: dayLabel, value: revenue };
    });

    // 5. Trends - Peak Hour
    const hourCounts: Record<string, number> = {};
    bookings.forEach((b) => {
      if (b.startTime) {
        const slot = b.startTime.split(' ')[0] || 'Unknown';
        hourCounts[slot] = (hourCounts[slot] || 0) + 1;
      }
    });
    let peakHour = 'N/A';
    let maxCount = 0;
    Object.entries(hourCounts).forEach(([slot, count]) => {
      if (count > maxCount) {
        maxCount = count;
        peakHour = slot;
      }
    });

    // 6. Trends - Payment Split
    const online = bookings.filter(
      (b) => b.paymentType === 'FULL_ONLINE',
    ).length;
    const cash = bookings.filter(
      (b) =>
        b.paymentType === 'HALF_ONLINE_HALF_CASH' ||
        b.paymentType === 'FULL_CASH',
    ).length;

    // 7. Trends - Most Booked Turf
    const turfCounts: Record<string, { name: string; count: number }> = {};
    bookings.forEach((b) => {
      if (b.turfId) {
        if (!turfCounts[b.turfId]) {
          turfCounts[b.turfId] = {
            name: b.turf?.name || 'Unknown Turf',
            count: 0,
          };
        }
        turfCounts[b.turfId].count += 1;
      }
    });
    let mostBookedTurf = 'N/A';
    let maxTurfBookings = 0;
    Object.values(turfCounts).forEach((tc) => {
      if (tc.count > maxTurfBookings) {
        maxTurfBookings = tc.count;
        mostBookedTurf = tc.name;
      }
    });

    // 8. Recent Bookings (limit 5)
    const recentBookings = [...bookings]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5)
      .map((b) => ({
        id: b.id,
        displayId: `TRF-${b.id.slice(0, 7).toUpperCase()}`,
        userName: b.user?.userProfile?.name || 'Customer',
        userPhone: b.user?.phone || 'N/A',
        turfName: b.turf?.name || 'Unknown Turf',
        sport: b.turf?.sportsType || 'Sports',
        amount: b.amount,
        status: b.bookingStatus,
        paymentType: b.paymentType,
        paymentStatus: b.paymentStatus,
        balanceAmount: b.amount - (b.depositAmount || 0),
        depositAmount: b.depositAmount,
        bookingDate: b.bookingDate.toISOString(),
        startTime: b.startTime,
        endTime: b.endTime,
        createdAt: b.createdAt.toISOString(),
      }));

    return {
      success: true,
      data: {
        summary: {
          revenue: {
            today: revenueToday,
            month: revenueMonth,
            overall: revenueOverall,
          },
          counts: {
            total: bookingsTotal,
            today: bookingsToday,
            upcoming: bookingsUpcoming,
            completed: bookingsCompleted,
            cancelled: bookingsCancelled,
            noShow: bookingsNoShow,
            pending: bookingsPending,
          },
          quickStats: {
            avgBookingValue,
            cancellationRate,
          },
        },
        trends: {
          revenueChart,
          peakHour,
          paymentSplit: {
            online,
            cash,
          },
          mostBookedTurf,
        },
        recentBookings,
      },
    };
  }
}
