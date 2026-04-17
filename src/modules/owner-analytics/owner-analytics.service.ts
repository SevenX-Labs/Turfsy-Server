import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentType } from '@prisma/client';

@Injectable()
export class OwnerAnalyticsService {
  constructor(private prisma: PrismaService) {}

  private async getOwnerBookings(ownerAuthId: string) {
    const owner = await this.prisma.ownerProfile.findUnique({
      where: { authId: ownerAuthId },
      include: { turfs: { select: { id: true } } },
    });
    if (!owner) throw new NotFoundException('Owner profile not found');
    const turfIds = owner.turfs.map((t) => t.id);
    return this.prisma.booking.findMany({
      where: { turfId: { in: turfIds } },
      take: 10000, // Maximum cap to prevent OOM
    });
  }

  async getTotalRevenue(ownerAuthId: string) {
    const bookings = await this.getOwnerBookings(ownerAuthId);
    const total = bookings
      .filter((b) => b.bookingStatus === 'COMPLETED')
      .reduce((sum, b) => sum + b.amount, 0);
    return { success: true, data: { totalRevenue: total } };
  }

  async getTotalBookings(ownerAuthId: string) {
    const bookings = await this.getOwnerBookings(ownerAuthId);
    return { success: true, data: { totalBookings: bookings.length } };
  }

  async getCompletedBookings(ownerAuthId: string) {
    const bookings = await this.getOwnerBookings(ownerAuthId);
    const count = bookings.filter(
      (b) => b.bookingStatus === 'COMPLETED',
    ).length;
    return { success: true, data: { completedBookings: count } };
  }

  async getCancelledBookings(ownerAuthId: string) {
    const bookings = await this.getOwnerBookings(ownerAuthId);
    const count = bookings.filter(
      (b) => b.bookingStatus === 'CANCELLED',
    ).length;
    return { success: true, data: { cancelledBookings: count } };
  }

  async getRevenueByDate(ownerAuthId: string) {
    const bookings = await this.getOwnerBookings(ownerAuthId);
    const map: { [date: string]: number } = {};
    bookings
      .filter((b) => b.bookingStatus === 'COMPLETED')
      .forEach((b) => {
        const date = b.bookingDate.toISOString().split('T')[0];
        map[date] = (map[date] || 0) + b.amount;
      });
    const result = Object.entries(map).map(([date, revenue]) => ({
      date,
      revenue,
    }));
    return {
      success: true,
      data: result.sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async getBookingsByDate(ownerAuthId: string) {
    const bookings = await this.getOwnerBookings(ownerAuthId);
    const map: { [date: string]: number } = {};
    bookings.forEach((b) => {
      const date = b.bookingDate.toISOString().split('T')[0];
      map[date] = (map[date] || 0) + 1;
    });
    const result = Object.entries(map).map(([date, count]) => ({
      date,
      count,
    }));
    return {
      success: true,
      data: result.sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async getCashVsOnline(ownerAuthId: string) {
    const bookings = await this.getOwnerBookings(ownerAuthId);
    const cashAmount = bookings
      .filter(
        (b) =>
          (b.paymentType === PaymentType.HALF_ONLINE_HALF_CASH ||
            b.paymentType === PaymentType.FULL_CASH) &&
          (b.bookingStatus === 'COMPLETED' || b.paymentStatus === 'SUCCESS'),
      )
      .reduce((sum, b) => sum + b.amount, 0);
    const onlineAmount = bookings
      .filter(
        (b) =>
          b.paymentType === PaymentType.FULL_ONLINE &&
          (b.bookingStatus === 'COMPLETED' || b.paymentStatus === 'SUCCESS'),
      )
      .reduce((sum, b) => sum + b.amount, 0);
    return { success: true, data: { cashAmount, onlineAmount } };
  }

  async getPeakHours(ownerAuthId: string) {
    const bookings = await this.getOwnerBookings(ownerAuthId);
    const map: { [hour: string]: number } = {};
    bookings.forEach((b) => {
      const hour = b.startTime.split(':')[0] + ':00';
      map[hour] = (map[hour] || 0) + 1;
    });
    const result = Object.entries(map).map(([hour, count]) => ({
      hour,
      count,
    }));
    return { success: true, data: result.sort((a, b) => b.count - a.count) };
  }

  async getCancellationRate(ownerAuthId: string) {
    const bookings = await this.getOwnerBookings(ownerAuthId);
    const cancelled = bookings.filter(
      (b) => b.bookingStatus === 'CANCELLED',
    ).length;
    const rate = bookings.length > 0 ? (cancelled / bookings.length) * 100 : 0;
    return { success: true, data: { cancellationRate: rate.toFixed(1) + '%' } };
  }

  async getNoShowRate(ownerAuthId: string) {
    const bookings = await this.getOwnerBookings(ownerAuthId);
    const noShow = bookings.filter((b) => b.bookingStatus === 'NO_SHOW').length;
    const rate = bookings.length > 0 ? (noShow / bookings.length) * 100 : 0;
    return { success: true, data: { noShowRate: rate.toFixed(1) + '%' } };
  }

  async getOverallAnalytics(ownerAuthId: string) {
    const bookings = await this.getOwnerBookings(ownerAuthId);
    // (Existing combined logic)
    const totalBookings = bookings.length;
    const completed = bookings.filter((b) => b.bookingStatus === 'COMPLETED');
    const cancelled = bookings.filter((b) => b.bookingStatus === 'CANCELLED');
    const noShows = bookings.filter((b) => b.bookingStatus === 'NO_SHOW');
    const totalRevenue = completed.reduce((sum, b) => sum + b.amount, 0);

    return {
      success: true,
      data: {
        totalRevenue,
        totalBookings,
        completedBookings: completed.length,
        cancelledBookings: cancelled.length,
        noShowBookings: noShows.length,
        totalPlayersCount: bookings.reduce(
          (sum, b: any) => sum + (b.playersCount || 0),
          0,
        ),
        avgPlayersPerBooking:
          totalBookings > 0
            ? (
                bookings.reduce(
                  (sum, b: any) => sum + (b.playersCount || 0),
                  0,
                ) / totalBookings
              ).toFixed(1)
            : 0,
        cancellationRate:
          totalBookings > 0
            ? ((cancelled.length / totalBookings) * 100).toFixed(1) + '%'
            : '0%',
        noShowRate:
          totalBookings > 0
            ? ((noShows.length / totalBookings) * 100).toFixed(1) + '%'
            : '0%',
      },
    };
  }
}
