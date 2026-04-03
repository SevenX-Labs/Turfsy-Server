import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';

// ─── CONSTANTS ───────────────────────────────────────────
const CASH_DEPOSIT_PERCENT = 0.50;     // 50% advance for CASH bookings
const CANCEL_REFUND_PERCENT = 0.75;    // 75% refund on cancellation
const NIGHT_START_HOUR = 18;           // 6 PM onwards = night pricing

@Injectable()
export class BookingService {
  private razorpay: Razorpay;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.razorpay = new Razorpay({
      key_id: this.configService.get<string>('RAZORPAY_KEY_ID') || '',
      key_secret: this.configService.get<string>('RAZORPAY_KEY_SECRET') || '',
    });
  }

  // ───────────────────────────────────────────────────────
  // 1. CREATE BOOKING (with auto price calculation)
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
      notes?: string;
    },
  ) {
    const turf = await this.prisma.turf.findUnique({ where: { id: dto.turfId } });
    if (!turf) throw new NotFoundException('Turf not found');
    if (turf.status !== 'ACTIVE') throw new BadRequestException('Turf is not currently available');

    const bookingDate = new Date(dto.bookingDate);

    // ── Prevent past-date bookings ──
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (bookingDate < today) {
      throw new BadRequestException('Cannot book for a past date');
    }

    // ── Double-booking prevention (interval overlap algorithm) ──
    const overlapping = await this.prisma.booking.findFirst({
      where: {
        turfId: dto.turfId,
        bookingDate,
        bookingStatus: { notIn: ['CANCELLED', 'NO_SHOW' as any] },
        startTime: { lt: dto.endTime },
        endTime: { gt: dto.startTime },
      },
    });
    if (overlapping) {
      throw new BadRequestException(
        `Time slot unavailable. Overlaps with an existing booking from ${overlapping.startTime} to ${overlapping.endTime}`,
      );
    }

    // ── Turf operating hours validation ──
    if (dto.startTime < turf.openTime || dto.endTime > turf.closeTime) {
      throw new BadRequestException(`Turf operates from ${turf.openTime} to ${turf.closeTime}`);
    }

    // ── Minimum duration validation ──
    if (dto.durationMins < turf.minSlotDurationMins) {
      throw new BadRequestException(`Minimum slot duration is ${turf.minSlotDurationMins} minutes`);
    }

    // ── Dynamic price calculation ──
    const amount = this.calculatePrice(turf, bookingDate, dto.startTime, dto.durationMins);

    // ── Deposit amount ──
    const depositAmount = dto.paymentType === 'CASH'
      ? Math.round(amount * CASH_DEPOSIT_PERCENT)
      : amount;

    const bookingData: any = {
      userId: authId,
      turfId: dto.turfId,
      bookingDate,
      startTime: dto.startTime,
      endTime: dto.endTime,
      durationMins: dto.durationMins,
      paymentType: dto.paymentType,
      amount,
      depositAmount,
      notes: dto.notes,
      bookingStatus: 'PENDING',
      paymentStatus: 'PENDING',
    };

    // ── Generate unique 4-digit PIN ──
    bookingData.checkInPin = await this.generatePin(dto.turfId, bookingDate);
    bookingData.pinExpiresAt = this.buildSlotDateTime(dto.bookingDate, dto.endTime);

    const booking = await this.prisma.booking.create({ data: bookingData });

    const result = {
      ...booking,
      displayId: this.formatBookingId(booking.id),
      amountToPay: depositAmount,
      remainingAmount: amount - depositAmount,
    };

    return {
      success: true,
      message: dto.paymentType === 'CASH'
        ? `Booking created. Pay 50% deposit (₹${depositAmount}) online. Remaining ₹${amount - depositAmount} at turf.`
        : `Booking created. Pay full amount (₹${amount}) to confirm.`,
      data: result,
    };
  }

  // ───────────────────────────────────────────────────────
  // 1.5 GET BOOKED SLOTS (For Availability checking)
  // ───────────────────────────────────────────────────────
  async getBookedSlots(turfId: string, date: string) {
    const turf = await this.prisma.turf.findUnique({
      where: { id: turfId },
      select: {
        openTime: true, closeTime: true,
        weekdayDayPrice: true, weekdayNightPrice: true,
        weekendDayPrice: true, weekendNightPrice: true,
      },
    });
    if (!turf) throw new NotFoundException('Turf not found');

    const bookingDate = new Date(date);
    const bookings = await this.prisma.booking.findMany({
      where: {
        turfId,
        bookingDate,
        bookingStatus: { notIn: ['CANCELLED', 'NO_SHOW' as any] },
      },
      select: { startTime: true, endTime: true },
      orderBy: { startTime: 'asc' },
    });

    // Determine pricing for the selected date
    const isWeekend = this.isWeekend(bookingDate);

    return {
      success: true,
      data: {
        openTime: turf.openTime,
        closeTime: turf.closeTime,
        bookedSlots: bookings,
        pricing: {
          dayPrice: isWeekend ? turf.weekendDayPrice : turf.weekdayDayPrice,
          nightPrice: isWeekend ? turf.weekendNightPrice : turf.weekdayNightPrice,
          nightStartsAt: `${NIGHT_START_HOUR}:00`,
          isWeekend,
        },
      },
    };
  }

  // ───────────────────────────────────────────────────────
  // 1.6 CREATE RAZORPAY ORDER
  // ───────────────────────────────────────────────────────
  async createRazorpayOrder(authId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId) throw new ForbiddenException('Not your booking');
    if (booking.bookingStatus !== 'PENDING') {
      throw new BadRequestException('Booking is not in pending state');
    }

    const amountInPaise = (booking as any).depositAmount * 100; // Razorpay expects paise

    const keyId = this.configService.get<string>('RAZORPAY_KEY_ID') || '';

    // MOCK BEHAVIOR FOR TESTING WITHOUT REAL KEYS
    if (keyId === 'your_razorpay_key_id' || keyId === '') {
      const mockOrderId = `order_${crypto.randomBytes(8).toString('hex')}`;
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { razorpayOrderId: mockOrderId },
      });
      return {
        success: true,
        data: {
          orderId: mockOrderId,
          amount: amountInPaise,
          currency: 'INR',
          bookingId: booking.id,
          displayId: this.formatBookingId(booking.id),
          keyId: 'mock_test_key',
        },
      };
    }

    const order = await this.razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `TRF-${booking.id.slice(0, 7)}`,
      notes: {
        bookingId: booking.id,
        turfId: booking.turfId,
        paymentType: booking.paymentType,
      },
    });

    // Store razorpay order id
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { razorpayOrderId: order.id },
    });

    return {
      success: true,
      data: {
        orderId: order.id,
        amount: amountInPaise,
        currency: 'INR',
        bookingId: booking.id,
        displayId: this.formatBookingId(booking.id),
        keyId: this.configService.get<string>('RAZORPAY_KEY_ID'),
      },
    };
  }

  // ───────────────────────────────────────────────────────
  // 2. VERIFY RAZORPAY PAYMENT & CONFIRM BOOKING
  // ───────────────────────────────────────────────────────
  async confirmOnlinePayment(
    authId: string,
    bookingId: string,
    dto: {
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    },
  ) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId) throw new ForbiddenException('Not your booking');
    if (booking.bookingStatus !== 'PENDING') throw new BadRequestException('Booking is not in pending state');

    // ── Verify Razorpay signature ──
    const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET') || '';

    // Bypass signature check if using placeholder test keys
    if (keySecret !== 'your_razorpay_key_secret' && keySecret !== '') {
      const generatedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
        .digest('hex');

      if (generatedSignature !== dto.razorpaySignature) {
        // Signature mismatch → payment tampered
        await this.prisma.booking.update({
          where: { id: bookingId },
          data: { bookingStatus: 'CANCELLED', paymentStatus: 'FAILED' },
        });
        throw new BadRequestException('Payment verification failed. Invalid signature.');
      }
    }

    // ONLINE → full payment done → SUCCESS
    // CASH → only 50% deposit paid → PENDING (remaining at turf)
    const newPaymentStatus = booking.paymentType === 'ONLINE' ? 'SUCCESS' : 'PENDING';

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        bookingStatus: 'CONFIRMED',
        paymentStatus: newPaymentStatus,
        razorpayOrderId: dto.razorpayOrderId,
        razorpayPaymentId: dto.razorpayPaymentId,
      },
    });

    const result = { ...updated, displayId: this.formatBookingId(updated.id) };

    return {
      success: true,
      message: booking.paymentType === 'CASH'
        ? `Deposit paid. Booking confirmed! Pay remaining ₹${booking.amount - (booking as any).depositAmount} at turf. Your Check-In PIN is ${booking.checkInPin}.`
        : `Payment successful. Booking confirmed! Your Check-In PIN is ${booking.checkInPin}.`,
      data: result,
    };
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

    const result = { ...updated, displayId: this.formatBookingId(updated.id) };

    return { success: true, message: 'Payment failed. Booking cancelled.', data: result };
  }

  // ───────────────────────────────────────────────────────
  // 4. VERIFY CHECK-IN PIN (Owner verifies at turf)
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
    if (booking.bookingStatus !== 'CONFIRMED') throw new BadRequestException('Booking is not confirmed');
    if (booking.checkInPin !== pin) throw new BadRequestException('Invalid PIN');

    // ── Time-window validation: ±10 minutes buffer ──
    const now = new Date();
    const datePart = booking.bookingDate.toISOString().split('T')[0];
    const slotStart = this.buildSlotDateTime(datePart, booking.startTime);
    const slotEnd = this.buildSlotDateTime(datePart, booking.endTime);

    const bufferMs = 10 * 60 * 1000;
    const startWithBuffer = new Date(slotStart.getTime() - bufferMs);
    const endWithBuffer = new Date(slotEnd.getTime() + bufferMs);

    if (now < startWithBuffer) {
      throw new BadRequestException(
        `Too early. PIN valid from ${startWithBuffer.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
      );
    }
    if (now > endWithBuffer) {
      throw new BadRequestException(
        `PIN expired. Verification allowed within 10 mins after slot ends (${booking.endTime}).`,
      );
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { paymentStatus: 'SUCCESS', bookingStatus: 'COMPLETED', visitedAt: new Date() },
      include: { user: { include: { userProfile: true } } },
    });

    const result = {
      ...updated,
      displayId: this.formatBookingId(updated.id),
      userName: updated.user?.userProfile?.name || 'Customer',
    };

    return {
      success: true,
      message: `Check-in verified! Welcome ${result.userName}. Booking ${result.displayId} completed.`,
      data: result,
    };
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

    const result = { ...updated, displayId: this.formatBookingId(updated.id) };

    return { success: true, message: 'Booking marked as completed.', data: result };
  }

  // ───────────────────────────────────────────────────────
  // 6. CANCEL BOOKING
  // ───────────────────────────────────────────────────────
  async cancelBooking(authId: string, bookingId: string, reason?: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId) throw new ForbiddenException('Not your booking');

    if (booking.bookingStatus !== 'CONFIRMED' && booking.bookingStatus !== 'PENDING') {
      throw new BadRequestException('Invalid booking status for cancellation');
    }

    const slotDateTime = this.buildSlotDateTime(
      booking.bookingDate.toISOString().split('T')[0],
      booking.startTime,
    );
    const hoursUntilSlot = (slotDateTime.getTime() - Date.now()) / (1000 * 60 * 60);

    // ── Block cancellation within 2 hours ──
    if (hoursUntilSlot <= 2) {
      throw new BadRequestException('Cancellation not allowed within 2 hours of slot time');
    }

    // ── Calculate 75% refund on whatever was paid online ──
    let refundAmount = 0;
    let newPaymentStatus = booking.paymentStatus;

    if (booking.razorpayPaymentId) {
      refundAmount = Math.round((booking as any).depositAmount * CANCEL_REFUND_PERCENT);
      newPaymentStatus = 'REFUNDED';
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

    const result = {
      ...updated,
      displayId: this.formatBookingId(updated.id),
      refundAmount,
    };

    return {
      success: true,
      message: refundAmount > 0
        ? `Booking cancelled. 75% refund of ₹${(booking as any).depositAmount} → ₹${refundAmount} will be processed.`
        : 'Booking cancelled successfully.',
      data: result,
    };
  }

  // ───────────────────────────────────────────────────────
  // 6.5 CRON: MARK NO SHOWS (15 min after slot start)
  // ───────────────────────────────────────────────────────
  async markNoShows() {
    const confirmedBookings = await this.prisma.booking.findMany({
      where: { bookingStatus: 'CONFIRMED' },
    });

    const now = new Date();
    let updatedCount = 0;

    for (const booking of confirmedBookings) {
      const slotStart = this.buildSlotDateTime(
        booking.bookingDate.toISOString().split('T')[0],
        booking.startTime,
      );

      const noShowThreshold = new Date(slotStart.getTime() + 15 * 60 * 1000);

      if (now > noShowThreshold) {
        await this.prisma.booking.update({
          where: { id: booking.id },
          data: { bookingStatus: 'NO_SHOW' as any },
        });
        updatedCount++;
      }
    }

    return { success: true, count: updatedCount, message: `Marked ${updatedCount} bookings as NO_SHOW` };
  }

  // ───────────────────────────────────────────────────────
  // 6.6 CRON: AUTO-COMPLETE ONLINE BOOKINGS (after slot ends)
  // ───────────────────────────────────────────────────────
  async autoCompleteOnlineBookings() {
    const confirmedOnline = await this.prisma.booking.findMany({
      where: {
        bookingStatus: 'CONFIRMED',
        paymentType: 'ONLINE',
        paymentStatus: 'SUCCESS',
      },
    });

    const now = new Date();
    let updatedCount = 0;

    for (const booking of confirmedOnline) {
      const slotEnd = this.buildSlotDateTime(
        booking.bookingDate.toISOString().split('T')[0],
        booking.endTime,
      );

      if (now > slotEnd) {
        await this.prisma.booking.update({
          where: { id: booking.id },
          data: { bookingStatus: 'COMPLETED', visitedAt: slotEnd },
        });
        updatedCount++;
      }
    }

    return { success: true, count: updatedCount, message: `Auto-completed ${updatedCount} online bookings` };
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

    const mapped = bookings.map((b) => ({ ...b, displayId: this.formatBookingId(b.id) }));

    return { success: true, count: mapped.length, data: mapped };
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

    const result = { ...booking, displayId: this.formatBookingId(booking.id) };

    return { success: true, data: result };
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
        { bookingStatus: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] } },
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

    const mapped = bookings.map((b) => ({ ...b, displayId: this.formatBookingId(b.id) }));

    return { success: true, count: mapped.length, data: mapped };
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

    const mapped = bookings.map((b) => ({ ...b, displayId: this.formatBookingId(b.id) }));

    return { success: true, count: mapped.length, data: mapped };
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
        id: true, amount: true, depositAmount: true,
        paymentType: true, paymentStatus: true,
        bookingStatus: true, razorpayOrderId: true, razorpayPaymentId: true,
        bookingDate: true, startTime: true, endTime: true,
        createdAt: true, cancelledAt: true,
        turf: { select: { id: true, name: true, city: true, entranceUrl: true } },
      } as any,
      orderBy: { createdAt: 'desc' },
    });

    const mapped = bookings.map((b) => ({ ...b, displayId: this.formatBookingId(b.id) }));

    return { success: true, count: mapped.length, data: mapped };
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

    const displayId = this.formatBookingId(booking.id);

    return {
      success: true,
      data: {
        invoiceId: `INV-${booking.id.slice(0, 8).toUpperCase()}`,
        bookingId: displayId,
        internalId: booking.id,
        bookingDate: booking.bookingDate,
        slot: `${booking.startTime} - ${booking.endTime}`,
        duration: `${booking.durationMins} mins`,
        amount: booking.amount,
        depositAmount: (booking as any).depositAmount,
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

  /**
   * Calculate price based on:
   * - Weekday vs Weekend (Sat/Sun)
   * - Day vs Night (before/after 6 PM)
   * - Duration in hours
   */
  private calculatePrice(
    turf: {
      weekdayDayPrice: number;
      weekdayNightPrice: number;
      weekendDayPrice: number;
      weekendNightPrice: number;
    },
    bookingDate: Date,
    startTime: string,
    durationMins: number,
  ): number {
    const isWeekendDay = this.isWeekend(bookingDate);
    const startHour = parseInt(startTime.split(':')[0], 10);
    const isNight = startHour >= NIGHT_START_HOUR;

    let pricePerHour: number;

    if (isWeekendDay) {
      pricePerHour = isNight ? turf.weekendNightPrice : turf.weekendDayPrice;
    } else {
      pricePerHour = isNight ? turf.weekdayNightPrice : turf.weekdayDayPrice;
    }

    const hours = durationMins / 60;
    return Math.round(pricePerHour * hours);
  }

  private isWeekend(date: Date): boolean {
    const day = date.getDay(); // 0 = Sunday, 6 = Saturday
    return day === 0 || day === 6;
  }

  private formatBookingId(uuid: string): string {
    return `TRF-${uuid.slice(0, 7).toUpperCase()}`;
  }

  private async generatePin(turfId: string, bookingDate: Date): Promise<string> {
    let pin = '';
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 15) {
      attempts++;
      pin = Math.floor(1000 + Math.random() * 9000).toString();
      const existing = await this.prisma.booking.findFirst({
        where: {
          turfId,
          bookingDate,
          checkInPin: pin,
          bookingStatus: { notIn: ['CANCELLED', 'NO_SHOW' as any] },
        },
      });
      if (!existing) isUnique = true;
    }
    return pin;
  }

  private buildSlotDateTime(dateSource: string | Date, timeStr: string): Date {
    const dateStr =
      dateSource instanceof Date
        ? dateSource.toISOString().split('T')[0]
        : dateSource;
    return new Date(`${dateStr}T${timeStr}:00`);
  }
}
