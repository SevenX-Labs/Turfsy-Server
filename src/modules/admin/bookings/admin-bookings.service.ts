import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import { Parser } from 'json2csv';
import * as pdfkit from 'pdfkit';

@Injectable()
export class AdminBookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async listBookings(query: {
    search?: string;
    bookingStatus?: BookingStatus;
    paymentStatus?: PaymentStatus;
    refundStatus?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.bookingStatus) {
      where.bookingStatus = query.bookingStatus;
    }
    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }
    if (query.refundStatus) {
      if (query.refundStatus === 'ANY') {
        where.refundStatus = { not: 'NONE' };
      } else {
        where.refundStatus = query.refundStatus;
      }
    }
    if (query.search) {
      where.OR = [
        { id: { contains: query.search } },
        { user: { phone: { contains: query.search } } },
        { turf: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [total, bookings] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
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

    // Apply computed status (same logic as customer app)
    const mappedBookings = bookings.map((b) => ({
      ...b,
      bookingStatus: this.mapBookingStatus(b),
    }));

    return {
      success: true,
      data: {
        bookings: mappedBookings,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getBookingDetails(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        user: { include: { userProfile: true } },
        turf: { include: { owner: true } },
        rating: true,
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');

    return {
      success: true,
      data: {
        ...booking,
        bookingStatus: this.mapBookingStatus(booking),
      },
    };
  }

  async markAsNoShow(id: string, adminId: string, ipAddress: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');

    const updated = await this.prisma.booking.update({
      where: { id },
      data: { bookingStatus: 'NO_SHOW' },
    });

    await this.prisma.adminActionLog.create({
      data: {
        adminId,
        action: 'BOOKING_CANCELLED', // or custom action if defined
        targetType: 'Booking',
        targetId: id,
        reason: 'Marked as NO_SHOW by Admin',
        ipAddress,
      },
    });

    return { success: true, data: updated };
  }

  async exportBookingsCsv(query: { search?: string; bookingStatus?: BookingStatus; paymentStatus?: PaymentStatus; refundStatus?: string }): Promise<string> {
    const where: any = {};
    if (query.bookingStatus) where.bookingStatus = query.bookingStatus;
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
    if (query.refundStatus) {
      if (query.refundStatus === 'ANY') {
        where.refundStatus = { not: 'NONE' };
      } else {
        where.refundStatus = query.refundStatus;
      }
    }
    if (query.search) {
      where.OR = [
        { id: { contains: query.search } },
        { user: { phone: { contains: query.search } } },
        { turf: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        user: { select: { phone: true } },
        turf: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const fields = [
      { label: 'Booking ID', value: 'id' },
      { label: 'Turf Name', value: 'turf.name' },
      { label: 'User Phone', value: 'user.phone' },
      { label: 'Booking Date', value: (row: any) => row.bookingDate.toISOString().split('T')[0] },
      { label: 'Slot', value: (row: any) => `${row.startTime} - ${row.endTime}` },
      { label: 'Amount Paid', value: 'amount' },
      { label: 'Booking Status', value: 'bookingStatus' },
      { label: 'Payment Status', value: 'paymentStatus' },
      { label: 'Refund Status', value: 'refundStatus' },
      { label: 'Refund Amount', value: 'refundAmount' },
    ];

    const json2csvParser = new Parser({ fields });
    return json2csvParser.parse(bookings);
  }

  async exportBookingsPdf(query: { search?: string; bookingStatus?: BookingStatus; paymentStatus?: PaymentStatus; refundStatus?: string }): Promise<Buffer> {
    const where: any = {};
    if (query.bookingStatus) where.bookingStatus = query.bookingStatus;
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
    if (query.refundStatus) {
      if (query.refundStatus === 'ANY') {
        where.refundStatus = { not: 'NONE' };
      } else {
        where.refundStatus = query.refundStatus;
      }
    }
    if (query.search) {
      where.OR = [
        { id: { contains: query.search } },
        { user: { phone: { contains: query.search } } },
        { turf: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        user: { select: { phone: true } },
        turf: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // cap pdf report at 50 for performance
    });

    return new Promise((resolve, reject) => {
      const doc = new ((pdfkit as any).default || (pdfkit as any))({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('Turfsy Bookings Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
      doc.moveDown();

      // Table Header
      const tableTop = 150;
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Booking ID', 50, tableTop);
      doc.text('Turf', 150, tableTop);
      doc.text('Phone', 280, tableTop);
      doc.text('Date/Slot', 380, tableTop);
      doc.text('Amount', 480, tableTop);
      doc.text('Status', 530, tableTop);

      doc.moveTo(50, tableTop + 15).lineTo(580, tableTop + 15).stroke();

      // Table Rows
      let y = tableTop + 25;
      doc.font('Helvetica');
      for (const booking of bookings) {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }

        doc.text(booking.id.slice(0, 8).toUpperCase(), 50, y);
        doc.text(booking.turf.name.slice(0, 18), 150, y);
        doc.text(booking.user.phone, 280, y);
        doc.text(`${booking.bookingDate.toISOString().split('T')[0]} ${booking.startTime}`, 380, y);
        doc.text(`Rs. ${booking.amount}`, 480, y);
        doc.text(booking.bookingStatus, 530, y);

        y += 20;
      }

      doc.end();
    });
  }

  async getBookingStats() {
    const counts = await this.prisma.booking.groupBy({
      by: ['bookingStatus'],
      _count: { id: true },
    });

    const statsMap: any = {
      TOTAL: 0,
      PENDING: 0,
      PENDING_APPROVAL: 0,
      CONFIRMED: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_SHOW: 0,
      REFUNDED: 0,
      REJECTED: 0,
    };

    let total = 0;
    for (const group of counts) {
      statsMap[group.bookingStatus] = group._count.id;
      total += group._count.id;
    }
    statsMap.TOTAL = total;

    return {
      success: true,
      data: statsMap,
    };
  }

  /**
   * Compute display status based on time — mirrors BookingService.mapBookingStatus().
   * If a CONFIRMED booking's slot has passed, show it as NO_SHOW in the admin UI.
   */
  private mapBookingStatus(booking: any): string {
    if (booking.bookingStatus !== 'CONFIRMED') {
      return booking.bookingStatus;
    }

    const now = new Date();
    const dateStr = new Date(booking.bookingDate).toISOString().split('T')[0];
    const slotEnd = new Date(`${dateStr}T${booking.endTime}:00+05:30`);

    if (now > slotEnd) {
      return 'NO_SHOW';
    }

    return booking.bookingStatus;
  }
}
