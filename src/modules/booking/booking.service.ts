import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BookingService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────────────────────────────────
  // 1. CREATE BOOKING
  // ───────────────────────────────────────────────────────
  async createBooking(
    authId: string,
    dto: {
      turfId: string;
      bookingDate: string;
      startTime: string;
      endTime: string;
      durationMins: number;
      paymentType: 'ONLINE' | 'CASH';
      amount: number;
      notes?: string;
    },
  ) {
    const turf = await this.prisma.turf.findUnique({ where: { id: dto.turfId } });
    if (!turf) throw new NotFoundException('Turf not found');
    if (turf.status !== 'ACTIVE') throw new BadRequestException('Turf is not currently available');

    const bookingDate = new Date(dto.bookingDate);
    // Check for ANY overlapping slot
    const overlapping = await this.prisma.booking.findFirst({
      where: {
        turfId: dto.turfId,
        bookingDate,
        bookingStatus: { not: 'CANCELLED' },
        // Two time ranges overlap if (A.start < B.end) AND (A.end > B.start)
        // String comparison works perfectly for "HH:mm" format.
        startTime: { lt: dto.endTime },
        endTime: { gt: dto.startTime },
      },
    });
    if (overlapping) {
      throw new BadRequestException(
        `Time slot unavailable. Overlaps with an existing booking from ${overlapping.startTime} to ${overlapping.endTime}`,
      );
    }

    if (dto.startTime < turf.openTime || dto.endTime > turf.closeTime) {
      throw new BadRequestException(`Turf operates from ${turf.openTime} to ${turf.closeTime}`);
    }

    if (dto.durationMins < turf.minSlotDurationMins) {
      throw new BadRequestException(`Minimum slot duration is ${turf.minSlotDurationMins} minutes`);
    }

    const bookingData: any = {
      userId: authId,
      turfId: dto.turfId,
      bookingDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      durationMins: dto.durationMins,
      paymentType: dto.paymentType,
      amount: dto.amount,
      notes: dto.notes,
      bookingStatus: 'PENDING',
      paymentStatus: 'PENDING',
    };

    // CASH → auto-confirm + generate PIN
    if (dto.paymentType === 'CASH') {
      bookingData.checkInPin = this.generatePin();
      bookingData.pinExpiresAt = this.buildSlotDateTime(dto.bookingDate, dto.endTime);
      bookingData.bookingStatus = 'CONFIRMED';
    }

    const booking = await this.prisma.booking.create({ data: bookingData });

    return {
      success: true,
      message:
        dto.paymentType === 'CASH'
          ? 'Booking confirmed. Show PIN to owner at check-in.'
          : 'Booking created. Complete payment to confirm.',
      data: booking,
    };
  }

  // ───────────────────────────────────────────────────────
  // 1.5 GET BOOKED SLOTS (For Availability checking)
  // ───────────────────────────────────────────────────────
  async getBookedSlots(turfId: string, date: string) {
    const turf = await this.prisma.turf.findUnique({
      where: { id: turfId },
      select: { openTime: true, closeTime: true },
    });
    if (!turf) throw new NotFoundException('Turf not found');

    const bookingDate = new Date(date);
    const bookings = await this.prisma.booking.findMany({
      where: {
        turfId,
        bookingDate,
        bookingStatus: { not: 'CANCELLED' },
      },
      select: {
        startTime: true,
        endTime: true,
      },
      orderBy: { startTime: 'asc' },
    });

    return {
      success: true,
      data: {
        openTime: turf.openTime,
        closeTime: turf.closeTime,
        bookedSlots: bookings,
      },
    };
  }

  // ───────────────────────────────────────────────────────
  // 2. CONFIRM ONLINE PAYMENT
  // ───────────────────────────────────────────────────────
  async confirmOnlinePayment(
    authId: string,
    bookingId: string,
    dto: { razorpayOrderId: string; razorpayPaymentId: string },
  ) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId) throw new ForbiddenException('Not your booking');
    if (booking.paymentType !== 'ONLINE') throw new BadRequestException('Booking is not online payment');
    if (booking.bookingStatus !== 'PENDING') throw new BadRequestException('Booking is not in pending state');

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        bookingStatus: 'CONFIRMED',
        paymentStatus: 'SUCCESS',
        razorpayOrderId: dto.razorpayOrderId,
        razorpayPaymentId: dto.razorpayPaymentId,
      },
    });

    return { success: true, message: 'Payment successful. Booking confirmed!', data: updated };
  }

  // ───────────────────────────────────────────────────────
  // 3. MARK PAYMENT FAILED
  // ───────────────────────────────────────────────────────
  async failOnlinePayment(authId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId) throw new ForbiddenException('Not your booking');

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { bookingStatus: 'CANCELLED', paymentStatus: 'FAILED' },
    });

    return { success: true, message: 'Payment failed. Booking cancelled.', data: updated };
  }

  // ───────────────────────────────────────────────────────
  // 4. CASH CHECK-IN (Owner verifies PIN)
  // ───────────────────────────────────────────────────────
  async verifyCheckInPin(ownerAuthId: string, bookingId: string, pin: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { turf: { include: { owner: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    if (booking.turf.owner.authId !== ownerAuthId) {
      throw new ForbiddenException('Only the turf owner can verify check-in');
    }
    if (booking.paymentType !== 'CASH') throw new BadRequestException('This booking is not cash-based');
    if (booking.bookingStatus !== 'CONFIRMED') throw new BadRequestException('Booking is not confirmed');
    if (booking.checkInPin !== pin) throw new BadRequestException('Invalid PIN');
    if (booking.pinExpiresAt && new Date() > booking.pinExpiresAt) {
      throw new BadRequestException('PIN has expired');
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { paymentStatus: 'SUCCESS', bookingStatus: 'COMPLETED', visitedAt: new Date() },
    });

    return { success: true, message: 'Check-in verified. Booking completed!', data: updated };
  }

  // ───────────────────────────────────────────────────────
  // 5. MARK ONLINE BOOKING COMPLETED (Owner side)
  // ───────────────────────────────────────────────────────
  async completeBooking(ownerAuthId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { turf: { include: { owner: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.turf.owner.authId !== ownerAuthId) {
      throw new ForbiddenException('Only the turf owner can complete bookings');
    }
    if (booking.bookingStatus !== 'CONFIRMED') {
      throw new BadRequestException('Only confirmed bookings can be completed');
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { bookingStatus: 'COMPLETED', visitedAt: new Date() },
    });

    return { success: true, message: 'Booking marked as completed.', data: updated };
  }

  // ───────────────────────────────────────────────────────
  // 6. CANCEL BOOKING
  // ───────────────────────────────────────────────────────
  async cancelBooking(authId: string, bookingId: string, reason?: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId) throw new ForbiddenException('Not your booking');
    if (['COMPLETED', 'CANCELLED'].includes(booking.bookingStatus)) {
      throw new BadRequestException('Cannot cancel this booking');
    }

    const slotDateTime = this.buildSlotDateTime(
      booking.bookingDate.toISOString().split('T')[0],
      booking.startTime,
    );
    const hoursUntilSlot = (slotDateTime.getTime() - Date.now()) / (1000 * 60 * 60);

    let newPaymentStatus = booking.paymentStatus;
    if (booking.paymentType === 'ONLINE' && booking.paymentStatus === 'SUCCESS') {
      newPaymentStatus = hoursUntilSlot >= 2 ? 'REFUNDED' : 'SUCCESS';
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        bookingStatus: 'CANCELLED',
        paymentStatus: newPaymentStatus,
        cancelledAt: new Date(),
        cancelReason: reason || null,
      },
    });

    return {
      success: true,
      message:
        newPaymentStatus === 'REFUNDED'
          ? 'Booking cancelled. Refund will be processed.'
          : 'Booking cancelled. No refund (cancelled within 2 hours of slot).',
      data: updated,
    };
  }

  // ───────────────────────────────────────────────────────
  // 7. GET ALL MY BOOKINGS
  // ───────────────────────────────────────────────────────
  async getMyBookings(authId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { userId: authId },
      include: {
        turf: {
          select: {
            id: true, name: true, city: true, address: true,
            sportsType: true, entranceUrl: true, groundDayUrl: true,
            owner: { select: { name: true, contactNumber: true } },
          },
        },
        rating: true,
      },
      orderBy: { bookingDate: 'desc' },
    });

    return { success: true, count: bookings.length, data: bookings };
  }

  // ───────────────────────────────────────────────────────
  // 8. GET BOOKING DETAILS
  // ───────────────────────────────────────────────────────
  async getBookingDetails(authId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        turf: {
          select: {
            id: true, name: true, city: true, address: true, pincode: true,
            sportsType: true, turfSize: true, lat: true, lng: true,
            entranceUrl: true, groundDayUrl: true, groundNightUrl: true,
            floodLights: true, parking: true, washroom: true,
            weekdayDayPrice: true, weekdayNightPrice: true,
            weekendDayPrice: true, weekendNightPrice: true,
            owner: { select: { name: true, contactNumber: true } },
          },
        },
        rating: true,
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId) throw new ForbiddenException('Not your booking');

    return { success: true, data: booking };
  }

  // ───────────────────────────────────────────────────────
  // 9. BOOKINGS BY STATUS (upcoming / past)
  // ───────────────────────────────────────────────────────
  async getBookingsByStatus(authId: string, status: 'upcoming' | 'past') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const where: any = { userId: authId };

    if (status === 'upcoming') {
      where.bookingDate = { gte: today };
      where.bookingStatus = { in: ['PENDING', 'CONFIRMED'] };
    } else {
      where.OR = [
        { bookingDate: { lt: today } },
        { bookingStatus: { in: ['COMPLETED', 'CANCELLED'] } },
      ];
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        turf: {
          select: {
            id: true, name: true, city: true, address: true,
            sportsType: true, entranceUrl: true, groundDayUrl: true,
            owner: { select: { name: true, contactNumber: true } },
          },
        },
        rating: true,
      },
      orderBy: { bookingDate: status === 'upcoming' ? 'asc' : 'desc' },
    });

    return { success: true, count: bookings.length, data: bookings };
  }

  // ───────────────────────────────────────────────────────
  // 10. BOOKINGS BY FILTER (today / tomorrow / week / date)
  // ───────────────────────────────────────────────────────
  async getBookingsByFilter(
    authId: string,
    filter?: 'today' | 'tomorrow' | 'week',
    date?: string,
  ) {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (date) {
      startDate = new Date(date);
      endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
    } else if (filter === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
    } else if (filter === 'tomorrow') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
    } else if (filter === 'week') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);
    } else {
      return this.getMyBookings(authId);
    }

    const bookings = await this.prisma.booking.findMany({
      where: {
        userId: authId,
        bookingDate: { gte: startDate, lt: endDate },
      },
      include: {
        turf: {
          select: {
            id: true, name: true, city: true, address: true,
            sportsType: true, entranceUrl: true, groundDayUrl: true,
            owner: { select: { name: true, contactNumber: true } },
          },
        },
        rating: true,
      },
      orderBy: { bookingDate: 'asc' },
    });

    return { success: true, count: bookings.length, data: bookings };
  }

  // ───────────────────────────────────────────────────────
  // 11. TRANSACTION HISTORY
  // ───────────────────────────────────────────────────────
  async getTransactionHistory(authId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        userId: authId,
        paymentStatus: { in: ['SUCCESS', 'REFUNDED', 'FAILED'] },
      },
      select: {
        id: true, amount: true, paymentType: true, paymentStatus: true,
        bookingStatus: true, razorpayOrderId: true, razorpayPaymentId: true,
        bookingDate: true, startTime: true, endTime: true,
        createdAt: true, cancelledAt: true,
        turf: { select: { id: true, name: true, city: true, entranceUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, count: bookings.length, data: bookings };
  }

  // ───────────────────────────────────────────────────────
  // 12. RATE TURF (after COMPLETED booking only)
  // ───────────────────────────────────────────────────────
  async rateTurf(
    authId: string,
    bookingId: string,
    dto: { rating: number; review?: string },
  ) {
    if (dto.rating < 1 || dto.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId) throw new ForbiddenException('Not your booking');
    if (booking.bookingStatus !== 'COMPLETED') {
      throw new BadRequestException('You can only rate after completing a visit');
    }

    const existingRating = await this.prisma.turfRating.findUnique({ where: { bookingId } });
    if (existingRating) throw new BadRequestException('You have already rated this booking');

    const rating = await this.prisma.turfRating.create({
      data: {
        userId: authId,
        turfId: booking.turfId,
        bookingId,
        rating: dto.rating,
        review: dto.review,
      },
    });

    return { success: true, message: 'Thank you for your review!', data: rating };
  }

  // ───────────────────────────────────────────────────────
  // 13. INVOICE
  // ───────────────────────────────────────────────────────
  async getInvoice(authId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        turf: {
          select: {
            name: true, city: true, address: true, pincode: true, sportsType: true,
            owner: { select: { name: true, contactNumber: true, email: true } },
          },
        },
        user: {
          select: { phone: true, userProfile: { select: { name: true, email: true } } },
        },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId) throw new ForbiddenException('Not your booking');

    return {
      success: true,
      data: {
        invoiceId: `INV-${booking.id.slice(0, 8).toUpperCase()}`,
        bookingId: booking.id,
        bookingDate: booking.bookingDate,
        slot: `${booking.startTime} - ${booking.endTime}`,
        duration: `${booking.durationMins} mins`,
        amount: booking.amount,
        paymentType: booking.paymentType,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.bookingStatus,
        turf: booking.turf,
        customer: {
          name: booking.user.userProfile?.name || 'N/A',
          email: booking.user.userProfile?.email || 'N/A',
          phone: booking.user.phone,
        },
        createdAt: booking.createdAt,
      },
    };
  }

  // ─── HELPERS ───────────────────────────────────────────
  private generatePin(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  private buildSlotDateTime(dateStr: string, timeStr: string): Date {
    return new Date(`${dateStr}T${timeStr}:00`);
  }
}
