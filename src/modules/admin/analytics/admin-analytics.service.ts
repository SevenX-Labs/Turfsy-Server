import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Parser } from 'json2csv';
import * as pdfkit from 'pdfkit';

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlatformAnalytics() {
    // 1. Core aggregates (Completed bookings)
    const completedAgg = await this.prisma.booking.aggregate({
      where: { bookingStatus: 'COMPLETED' },
      _sum: { amount: true, platformFee: true },
      _count: { id: true },
    });

    const totalRevenue = completedAgg._sum.amount || 0;
    const totalPlatformFee = completedAgg._sum.platformFee || 0;
    const completedCount = completedAgg._count.id;

    // 2. Status rates
    const totalCount = await this.prisma.booking.count();
    const cancelledCount = await this.prisma.booking.count({ where: { bookingStatus: 'CANCELLED' } });
    const noShowCount = await this.prisma.booking.count({ where: { bookingStatus: 'NO_SHOW' } });

    const cancellationRate = totalCount > 0 ? (cancelledCount / totalCount) * 100 : 0;
    const noShowRate = totalCount > 0 ? (noShowCount / totalCount) * 100 : 0;

    // 3. Top Turfs by Booking Count & Revenue
    const topTurfs = await this.prisma.booking.groupBy({
      by: ['turfId'],
      where: { bookingStatus: 'COMPLETED' },
      _count: { id: true },
      _sum: { amount: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const topTurfsWithDetails = await Promise.all(
      topTurfs.map(async (item) => {
        const turf = await this.prisma.turf.findUnique({
          where: { id: item.turfId },
          select: { name: true, city: true },
        });
        return {
          turfId: item.turfId,
          name: turf?.name || 'Unknown',
          city: turf?.city || 'Unknown',
          bookingsCount: item._count.id,
          revenue: item._sum.amount || 0,
        };
      })
    );

    // 4. Top Owners by Booking Count & Revenue
    const bookings = await this.prisma.booking.findMany({
      where: { bookingStatus: 'COMPLETED' },
      select: {
        amount: true,
        turf: {
          select: {
            owner: { select: { id: true, name: true } },
          },
        },
      },
    });

    const ownerStatsMap = new Map<string, { name: string; bookingsCount: number; revenue: number }>();
    for (const b of bookings) {
      const owner = b.turf?.owner;
      if (owner) {
        const key = owner.id;
        const current = ownerStatsMap.get(key) || { name: owner.name || 'Unknown Owner', bookingsCount: 0, revenue: 0 };
        current.bookingsCount += 1;
        current.revenue += b.amount;
        ownerStatsMap.set(key, current);
      }
    }

    const topOwners = Array.from(ownerStatsMap.entries())
      .map(([id, val]) => ({ id, ...val }))
      .sort((a, b) => b.bookingsCount - a.bookingsCount)
      .slice(0, 5);

    // 5. Peak Hours
    const bookingsForHours = await this.prisma.booking.findMany({
      select: { startTime: true },
    });
    const hoursMap: { [hour: string]: number } = {};
    for (const b of bookingsForHours) {
      const hour = b.startTime.split(':')[0] || '00';
      hoursMap[hour] = (hoursMap[hour] || 0) + 1;
    }
    const peakHours = Object.entries(hoursMap)
      .map(([hour, count]) => ({ hour: `${hour}:00`, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 6. City Analytics
    const cityAgg = await this.prisma.booking.findMany({
      where: { bookingStatus: 'COMPLETED' },
      select: {
        amount: true,
        turf: { select: { city: true } },
      },
    });

    const cityStatsMap = new Map<string, { bookingsCount: number; revenue: number }>();
    for (const b of cityAgg) {
      const city = b.turf?.city || 'Unknown';
      const current = cityStatsMap.get(city) || { bookingsCount: 0, revenue: 0 };
      current.bookingsCount += 1;
      current.revenue += b.amount;
      cityStatsMap.set(city, current);
    }
    const cityAnalytics = Array.from(cityStatsMap.entries()).map(([city, val]) => ({ city, ...val }));

    return {
      success: true,
      data: {
        summary: {
          totalRevenue,
          totalPlatformFee,
          completedCount,
          totalBookingsCount: totalCount,
          cancellationRate,
          noShowRate,
        },
        topTurfs: topTurfsWithDetails,
        topOwners,
        peakHours,
        cityAnalytics,
      },
    };
  }

  async exportAnalyticsCsv(): Promise<string> {
    const analytics = await this.getPlatformAnalytics();
    const sum = analytics.data.summary;

    const data = [
      { Metric: 'Total Revenue', Value: sum.totalRevenue },
      { Metric: 'Total Platform Fee Earned', Value: sum.totalPlatformFee },
      { Metric: 'Completed Bookings Count', Value: sum.completedCount },
      { Metric: 'Total Bookings Count', Value: sum.totalBookingsCount },
      { Metric: 'Cancellation Rate (%)', Value: sum.cancellationRate.toFixed(2) },
      { Metric: 'No Show Rate (%)', Value: sum.noShowRate.toFixed(2) },
    ];

    const fields = ['Metric', 'Value'];
    const json2csvParser = new Parser({ fields });
    return json2csvParser.parse(data);
  }

  async exportAnalyticsPdf(): Promise<Buffer> {
    const analytics = await this.getPlatformAnalytics();
    const sum = analytics.data.summary;

    return new Promise((resolve, reject) => {
      const doc = new ((pdfkit as any).default || (pdfkit as any))({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('Turfsy Analytics Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
      doc.moveDown();

      doc.fontSize(14).text('Summary Metrics:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).text(`Total Revenue: Rs. ${sum.totalRevenue}`);
      doc.fontSize(11).text(`Total Platform Fee Earned: Rs. ${sum.totalPlatformFee}`);
      doc.fontSize(11).text(`Completed Bookings: ${sum.completedCount}`);
      doc.fontSize(11).text(`Total Bookings: ${sum.totalBookingsCount}`);
      doc.fontSize(11).text(`Cancellation Rate: ${sum.cancellationRate.toFixed(2)}%`);
      doc.fontSize(11).text(`No Show Rate: ${sum.noShowRate.toFixed(2)}%`);
      doc.moveDown();

      doc.fontSize(14).text('Top 5 Cities by Revenue:', { underline: true });
      doc.moveDown(0.5);
      const topCities = [...analytics.data.cityAnalytics]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
      for (const city of topCities) {
        doc.fontSize(10).text(`${city.city}: Rs. ${city.revenue} (${city.bookingsCount} bookings)`);
      }

      doc.end();
    });
  }
}
