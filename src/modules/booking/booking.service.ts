import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentLoggerService } from '../../common/services/payment-logger.service';
import { RateLimiterService, RATE_LIMITS } from '../../common/services/rate-limiter.service';
import { PaymentStatus } from '@prisma/client';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';

// ─── CONSTANTS ───────────────────────────────────────────
const CASH_DEPOSIT_PERCENT = 0.50;     // 50% advance for CASH bookings
const CANCEL_REFUND_PERCENT = 0.75;    // 75% refund on cancellation
const NIGHT_START_HOUR = 18;           // 6 PM onwards = night pricing
const PIN_MAX_ATTEMPTS = 5;            // Lock PIN after 5 wrong attempts
const PIN_WINDOW_MINUTES = 10;         // ±10 min for PIN verification

@Injectable()
export class BookingService {
  private razorpay: Razorpay;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paymentLogger: PaymentLoggerService,
    private readonly rateLimiter: RateLimiterService,
  ) {
    this.razorpay = new Razorpay({
      key_id: this.configService.get<string>('RAZORPAY_KEY_ID') || '',
      key_secret: this.configService.get<string>('RAZORPAY_KEY_SECRET') || '',
    });
  }

  // ═══════════════════════════════════════════════════════
  // 1. CREATE BOOKING
  //    Layer 4: Amount Integrity (server-side calculation)
  //    Layer 5: State Machine (new → PENDING)
  //    Layer 6: Rate Limiting (5 req/user/10min)
  //    Layer 7: Slot Conflict (transaction + FOR UPDATE)
  //    Layer 8: PIN Security (crypto.randomInt)
  //    Layer 10: Input Sanitization (DTO validated upstream)
  // ═══════════════════════════════════════════════════════
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
    ip?: string,
  ) {
    // ── Layer 6: Rate Limiting ──
    this.rateLimiter.check(`user:${authId}:create-booking`, RATE_LIMITS.CREATE_BOOKING);

    // ── Layer 10: Additional server-side validation ──
    this.validateBookingInputs(dto);

    // ── Strip HTML tags from notes ──
    const sanitizedNotes = dto.notes ? this.stripHtml(dto.notes) : undefined;

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

    // ── Turf operating hours validation ──
    if (dto.startTime < turf.openTime || dto.endTime > turf.closeTime) {
      throw new BadRequestException(`Turf operates from ${turf.openTime} to ${turf.closeTime}`);
    }

    // ── Duration validation ──
    if (dto.durationMins < turf.minSlotDurationMins) {
      throw new BadRequestException(`Minimum slot duration is ${turf.minSlotDurationMins} minutes`);
    }

    // ── Layer 4: Server-side price calculation (NEVER from client) ──
    const amount = this.calculatePrice(turf, bookingDate, dto.startTime, dto.durationMins);

    // ── Layer 4: Deposit amount (server-calculated) ──
    const depositAmount = dto.paymentType === 'CASH'
      ? Math.floor(amount * CASH_DEPOSIT_PERCENT) // Floor for cash
      : amount;

    // ── Layer 8: Secure PIN generation (crypto.randomInt) ──
    const checkInPin = crypto.randomInt(1000, 9999).toString();
    const pinExpiresAt = this.buildSlotDateTime(dto.bookingDate, dto.endTime);

    // ══════════════════════════════════════════════════
    // Layer 7: Transaction with row-level lock to prevent race conditions
    // ══════════════════════════════════════════════════
    const booking = await this.prisma.$transaction(async (tx) => {
      // FOR UPDATE lock on conflicting bookings
      const overlapping = await tx.$queryRawUnsafe<any[]>(
        `SELECT id FROM "bookings"
         WHERE "turf_id" = $1
         AND "booking_date" = $2
         AND "booking_status" IN ('PENDING', 'CONFIRMED')
         AND "start_time" < $3
         AND "end_time" > $4
         FOR UPDATE`,
        dto.turfId,
        bookingDate,
        dto.endTime,
        dto.startTime,
      );

      if (overlapping && overlapping.length > 0) {
        throw new BadRequestException('Slot already booked');
      }

      return tx.booking.create({
        data: {
          userId: authId,
          turfId: dto.turfId,
          bookingDate,
          startTime: dto.startTime,
          endTime: dto.endTime,
          durationMins: dto.durationMins,
          paymentType: dto.paymentType,
          amount,
          depositAmount,
          checkInPin,
          pinExpiresAt,
          notes: sanitizedNotes,
          bookingStatus: 'PENDING',
          paymentStatus: 'PENDING',
        },
      });
    });

    // ── Layer 12: Secure Logging ──
    this.paymentLogger.log({
      userId: authId,
      bookingId: booking.id,
      turfId: dto.turfId,
      action: 'create-booking',
      amount,
      ip,
      result: 'SUCCESS',
    });

    return {
      success: true,
      message: dto.paymentType === 'CASH'
        ? `Booking created. Pay 50% deposit (₹${depositAmount}) online. Remaining ₹${amount - depositAmount} at turf.`
        : `Booking created. Pay full amount (₹${amount}) to confirm.`,
      data: {
        ...booking,
        displayId: this.formatBookingId(booking.id),
        amountToPay: depositAmount,
        remainingAmount: amount - depositAmount,
      },
    };
  }

  // ═══════════════════════════════════════════════════════
  // 1.5 GET BOOKED SLOTS (Availability)
  //     Layer 6: Rate Limiting (30/user/1min)
  // ═══════════════════════════════════════════════════════
  async getBookedSlots(turfId: string, date: string, authId?: string) {
    // ── Layer 6: Rate Limiting ──
    if (authId) {
      this.rateLimiter.check(`user:${authId}:availability`, RATE_LIMITS.AVAILABILITY);
    }

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

  // ═══════════════════════════════════════════════════════
  // 1.6 CREATE RAZORPAY ORDER
  //     Layer 2: Idempotency (return existing order if exists)
  //     Layer 4: Amount from DB only
  //     Layer 5: State Machine (must be PENDING)
  //     Layer 6: Rate Limiting (3/booking/5min)
  // ═══════════════════════════════════════════════════════
  async createRazorpayOrder(authId: string, bookingId: string, ip?: string) {
    // ── Layer 6: Rate Limiting ──
    this.rateLimiter.check(`booking:${bookingId}:create-order`, RATE_LIMITS.CREATE_ORDER);

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');

    // ── Layer 1: Verify booking ownership ──
    if (booking.userId !== authId) throw new ForbiddenException('Access denied.');

    // ── Layer 5: State Machine ──
    if (booking.bookingStatus !== 'PENDING') {
      throw new BadRequestException('Booking is not in pending state');
    }

    // ══════════════════════════════════════════════════
    // Layer 2: Idempotency — return existing order
    // ══════════════════════════════════════════════════
    if (booking.razorpayOrderId) {
      this.paymentLogger.log({
        userId: authId,
        bookingId,
        turfId: booking.turfId,
        action: 'create-order',
        amount: booking.depositAmount,
        razorpayOrderId: booking.razorpayOrderId,
        ip,
        result: 'SUCCESS',
        rejectionReason: 'Idempotent return — existing order',
      });

      return {
        success: true,
        data: {
          orderId: booking.razorpayOrderId,
          amount: booking.depositAmount * 100,
          currency: 'INR',
          bookingId: booking.id,
          displayId: this.formatBookingId(booking.id),
          keyId: this.configService.get<string>('RAZORPAY_KEY_ID'),
        },
      };
    }

    // ── Layer 4: Amount from DB (NEVER from request) ──
    const amountInPaise = Math.round(booking.depositAmount * 100);
    if (amountInPaise <= 0) {
      throw new BadRequestException('Invalid amount');
    }

    const keyId = this.configService.get<string>('RAZORPAY_KEY_ID') || '';

    // ── Mock behavior for testing ──
    if (keyId === 'your_razorpay_key_id' || keyId === '') {
      const mockOrderId = `order_${crypto.randomBytes(8).toString('hex')}`;
      await this.prisma.booking.update({
        where: { id: bookingId },
        data: { razorpayOrderId: mockOrderId },
      });

      this.paymentLogger.log({
        userId: authId,
        bookingId,
        turfId: booking.turfId,
        action: 'create-order',
        amount: booking.depositAmount,
        razorpayOrderId: mockOrderId,
        ip,
        result: 'SUCCESS',
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

    // ── Create real Razorpay order ──
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

    // ── Store order ID in DB BEFORE returning to client ──
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { razorpayOrderId: order.id },
    });

    // ── Layer 12: Log ──
    this.paymentLogger.log({
      userId: authId,
      bookingId,
      turfId: booking.turfId,
      action: 'create-order',
      amount: booking.depositAmount,
      razorpayOrderId: order.id,
      ip,
      result: 'SUCCESS',
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

  // ═══════════════════════════════════════════════════════
  // 2. VERIFY RAZORPAY PAYMENT & CONFIRM BOOKING
  //    Layer 2: Idempotency
  //    Layer 3: Razorpay Signature Verification (timingSafeEqual)
  //    Layer 4: Amount Integrity (verify order.amount)
  //    Layer 5: State Machine (PENDING → CONFIRMED)
  //    Layer 6: Rate Limiting (3/booking/5min)
  //    Layer 12: Secure Logging + Alert on signature fail
  // ═══════════════════════════════════════════════════════
  async confirmOnlinePayment(
    authId: string,
    bookingId: string,
    dto: {
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    },
    ip?: string,
  ) {
    // ── Layer 6: Rate Limiting ──
    this.rateLimiter.check(`booking:${bookingId}:confirm-payment`, RATE_LIMITS.CONFIRM_PAYMENT);

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');

    // ── Layer 1: Verify ownership ──
    if (booking.userId !== authId) throw new ForbiddenException('Access denied.');

    // ══════════════════════════════════════════════════
    // Layer 2: Idempotency — already confirmed/completed?
    // ══════════════════════════════════════════════════
    if (booking.bookingStatus === 'CONFIRMED' || booking.bookingStatus === 'COMPLETED') {
      return {
        success: true,
        message: 'Payment already processed.',
        data: { ...booking, displayId: this.formatBookingId(booking.id) },
      };
    }

    // ── Layer 2: Payment already stored? ──
    if (booking.razorpayPaymentId) {
      throw new ConflictException('Payment already processed');
    }

    // ── Layer 5: State Machine — must be PENDING ──
    if (booking.bookingStatus !== 'PENDING') {
      throw new BadRequestException('Invalid booking state');
    }

    // ══════════════════════════════════════════════════
    // Layer 3: Razorpay Signature Verification
    // ══════════════════════════════════════════════════
    const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET') || '';

    if (keySecret !== 'your_razorpay_key_secret' && keySecret !== '') {
      // Step 1: Reconstruct HMAC-SHA256 signature
      const body = `${dto.razorpayOrderId}|${dto.razorpayPaymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(body)
        .digest('hex');

      // Step 2: Constant-time comparison (NEVER use == or ===)
      const expected = Buffer.from(expectedSignature, 'hex');
      const received = Buffer.from(dto.razorpaySignature, 'hex');

      let signatureValid = false;
      try {
        signatureValid =
          expected.length === received.length &&
          crypto.timingSafeEqual(expected, received);
      } catch {
        signatureValid = false;
      }

      if (!signatureValid) {
        // ── Layer 12: Alert on signature failure ──
        this.paymentLogger.alert('Signature verification failed', {
          userId: authId,
          bookingId,
          ip,
          razorpayOrderId: dto.razorpayOrderId,
        });

        this.paymentLogger.log({
          userId: authId,
          bookingId,
          turfId: booking.turfId,
          action: 'confirm',
          razorpayOrderId: dto.razorpayOrderId,
          razorpayPaymentId: dto.razorpayPaymentId,
          ip,
          result: 'REJECTED',
          rejectionReason: 'Invalid payment signature',
        });

        await this.prisma.booking.update({
          where: { id: bookingId },
          data: { bookingStatus: 'CANCELLED', paymentStatus: 'FAILED' },
        });

        throw new BadRequestException('Invalid payment signature');
      }

      // Step 3: Verify orderId matches DB-stored orderId
      if (booking.razorpayOrderId && dto.razorpayOrderId !== booking.razorpayOrderId) {
        this.paymentLogger.alert('Order ID tampered', {
          userId: authId,
          bookingId,
          expected: booking.razorpayOrderId,
          received: dto.razorpayOrderId,
          ip,
        });

        throw new BadRequestException('Order ID tampered');
      }

      // ══════════════════════════════════════════════════
      // Layer 4: Amount Integrity — verify Razorpay amount
      // ══════════════════════════════════════════════════
      try {
        const rzpOrder = await this.razorpay.orders.fetch(dto.razorpayOrderId);
        const expectedAmountPaise = Math.round(booking.depositAmount * 100);
        if (rzpOrder.amount !== expectedAmountPaise) {
          this.paymentLogger.alert('Amount mismatch detected', {
            userId: authId,
            bookingId,
            dbAmount: expectedAmountPaise,
            rzpAmount: rzpOrder.amount,
            ip,
          });
          throw new BadRequestException('Amount mismatch detected');
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        // If Razorpay fetch fails, log but proceed (signature was valid)
        console.warn(`[PAYMENT] Could not fetch Razorpay order for amount verification: ${err}`);
      }
    }

    // ── Update booking atomically ──
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

    // ── Layer 12: Log success ──
    this.paymentLogger.log({
      userId: authId,
      bookingId,
      turfId: booking.turfId,
      action: 'confirm',
      amount: booking.depositAmount,
      razorpayOrderId: dto.razorpayOrderId,
      razorpayPaymentId: dto.razorpayPaymentId,
      ip,
      result: 'SUCCESS',
    });

    return {
      success: true,
      message: booking.paymentType === 'CASH'
        ? `Deposit paid. Booking confirmed! Pay remaining ₹${booking.amount - booking.depositAmount} at turf. Your Check-In PIN is ${booking.checkInPin}.`
        : `Payment successful. Booking confirmed! Your Check-In PIN is ${booking.checkInPin}.`,
      data: { ...updated, displayId: this.formatBookingId(updated.id) },
    };
  }

  // ═══════════════════════════════════════════════════════
  // 3. MARK PAYMENT FAILED
  //    Layer 2: Idempotency
  //    Layer 5: State Machine (PENDING → CANCELLED)
  //    Layer 6: Rate Limiting (5/user/10min)
  // ═══════════════════════════════════════════════════════
  async failOnlinePayment(authId: string, bookingId: string, ip?: string) {
    // ── Layer 6: Rate Limiting ──
    this.rateLimiter.check(`user:${authId}:payment-failed`, RATE_LIMITS.PAYMENT_FAILED);

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId) throw new ForbiddenException('Access denied.');

    // ── Layer 5: State Machine ──
    if (booking.bookingStatus !== 'PENDING') {
      throw new BadRequestException('Invalid booking state');
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { bookingStatus: 'CANCELLED', paymentStatus: 'FAILED' },
    });

    // ── Layer 12 ──
    this.paymentLogger.log({
      userId: authId,
      bookingId,
      turfId: booking.turfId,
      action: 'failed',
      amount: booking.depositAmount,
      razorpayOrderId: booking.razorpayOrderId || undefined,
      ip,
      result: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Payment failed. Booking cancelled.',
      data: { ...updated, displayId: this.formatBookingId(updated.id) },
    };
  }

  // ═══════════════════════════════════════════════════════
  // 4. VERIFY CHECK-IN PIN (Owner verifies at turf)
  //    Layer 1: Owner role + turf ownership verification
  //    Layer 2: Idempotency (already completed?)
  //    Layer 5: State Machine (CONFIRMED → COMPLETED, CASH only)
  //    Layer 6: Rate Limiting (5/booking/15min)
  //    Layer 8: Constant-time PIN comparison, lockout
  // ═══════════════════════════════════════════════════════
  async verifyCheckInPin(ownerAuthId: string, bookingId: string, pin: string, ip?: string) {
    // ── Layer 6: Rate Limiting ──
    this.rateLimiter.check(`booking:${bookingId}:verify-pin`, RATE_LIMITS.VERIFY_PIN);

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { turf: { include: { owner: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    // ── Layer 1: Owner verification ──
    if (booking.turf.owner.authId !== ownerAuthId) {
      throw new ForbiddenException('Access denied.');
    }

    // ── Layer 2: Idempotency — already completed? ──
    if (booking.bookingStatus === 'COMPLETED') {
      return {
        success: true,
        message: 'Booking already completed.',
        data: { ...booking, displayId: this.formatBookingId(booking.id) },
      };
    }

    // ── Layer 5: State Machine ──
    if (booking.bookingStatus !== 'CONFIRMED') {
      throw new BadRequestException('Invalid booking state');
    }

    // ── Layer 8: Check PIN lock ──
    if (booking.pinLocked) {
      throw new HttpException('Resource locked.', HttpStatus.LOCKED); // 423
    }

    // ── Layer 8: Time window check (-10 min from start, +10 min from end) ──
    const now = new Date();
    const datePart = booking.bookingDate.toISOString().split('T')[0];
    const slotStart = this.buildSlotDateTime(datePart, booking.startTime);
    const slotEnd = this.buildSlotDateTime(datePart, booking.endTime);

    const windowStart = new Date(slotStart.getTime() - PIN_WINDOW_MINUTES * 60 * 1000);
    const windowEnd = new Date(slotEnd.getTime() + PIN_WINDOW_MINUTES * 60 * 1000);

    if (now < windowStart) {
      throw new BadRequestException(
        `PIN verification window opens at ${windowStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
      );
    }
    if (now > windowEnd) {
      throw new BadRequestException('PIN verification window expired');
    }

    // ── Layer 8: Constant-time PIN comparison ──
    const storedPin = booking.checkInPin || '';
    let pinValid = false;
    try {
      const pinBuf = Buffer.from(pin.padEnd(4, ' '));
      const storedBuf = Buffer.from(storedPin.padEnd(4, ' '));
      pinValid =
        pinBuf.length === storedBuf.length &&
        crypto.timingSafeEqual(pinBuf, storedBuf);
    } catch {
      pinValid = false;
    }

    if (!pinValid) {
      // ── Layer 8: Track failed attempts ──
      const newAttempts = (booking.pinAttempts || 0) + 1;
      const shouldLock = newAttempts >= PIN_MAX_ATTEMPTS;

      await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          pinAttempts: newAttempts,
          pinLocked: shouldLock,
        },
      });

      if (shouldLock) {
        // ── Layer 12: Alert on PIN lock ──
        this.paymentLogger.alert('PIN locked due to 5 wrong attempts', {
          bookingId,
          ownerAuthId,
          ip,
        });
        throw new HttpException('Resource locked.', HttpStatus.LOCKED); // 423
      }

      this.paymentLogger.log({
        userId: ownerAuthId,
        bookingId,
        turfId: booking.turfId,
        action: 'verify-pin',
        ip,
        result: 'REJECTED',
        rejectionReason: `Invalid PIN (attempt ${newAttempts}/${PIN_MAX_ATTEMPTS})`,
      });

      throw new BadRequestException('Invalid PIN');
    }

    // ── PIN valid → complete booking ──
    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: 'SUCCESS',
        bookingStatus: 'COMPLETED',
        visitedAt: new Date(),
        checkInPin: null,           // Layer 8: Null PIN after success
        pinAttempts: 0,
      },
      include: { user: { include: { userProfile: true } } },
    });

    const userName = updated.user?.userProfile?.name || 'Customer';

    // ── Layer 12 ──
    this.paymentLogger.log({
      userId: ownerAuthId,
      bookingId,
      turfId: booking.turfId,
      action: 'verify-pin',
      ip,
      result: 'SUCCESS',
    });

    return {
      success: true,
      message: `Check-in verified! Welcome ${userName}. Booking ${this.formatBookingId(updated.id)} completed.`,
      data: {
        ...updated,
        displayId: this.formatBookingId(updated.id),
        userName,
      },
    };
  }

  // ═══════════════════════════════════════════════════════
  // 5. MARK ONLINE BOOKING COMPLETED (Owner side)
  //    Layer 1: Owner + turf verification
  //    Layer 5: State Machine (CONFIRMED → COMPLETED, ONLINE only)
  // ═══════════════════════════════════════════════════════
  async completeBooking(ownerAuthId: string, bookingId: string, ip?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { turf: { include: { owner: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    // ── Layer 1: Owner verification ──
    if (booking.turf.owner.authId !== ownerAuthId) {
      throw new ForbiddenException('Access denied.');
    }

    // ── Layer 5: State Machine ──
    if (booking.bookingStatus !== 'CONFIRMED') {
      throw new BadRequestException('Only confirmed bookings can be completed');
    }

    // ── Layer 5 & Layer 8: Payment type check & Fallback Override ──
    if (booking.paymentType === 'CASH') {
      // For CASH, allow manual completion ONLY if the PIN window has expired
      const now = new Date();
      const datePart = booking.bookingDate.toISOString().split('T')[0];
      const slotEnd = this.buildSlotDateTime(datePart, booking.endTime);
      const windowEnd = new Date(slotEnd.getTime() + PIN_WINDOW_MINUTES * 60 * 1000);

      if (now <= windowEnd) {
        throw new BadRequestException(
          'Use Verify-PIN for active CASH bookings. Manual override is only available after the slot ends.',
        );
      }
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        bookingStatus: 'COMPLETED',
        paymentStatus: 'SUCCESS', // For CASH fallback, we assume money collected
        visitedAt: new Date(),
        checkInPin: null,         // Clean up unused PIN
        pinAttempts: 0,
      },
    });

    this.paymentLogger.log({
      userId: ownerAuthId,
      bookingId,
      turfId: booking.turfId,
      action: 'complete',
      ip,
      result: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Booking marked as completed.',
      data: { ...updated, displayId: this.formatBookingId(updated.id) },
    };
  }

  // ═══════════════════════════════════════════════════════
  // 6. CANCEL BOOKING
  //    Layer 2: Idempotency (already cancelled/refunded?)
  //    Layer 5: State Machine
  //    Layer 6: Rate Limiting (3/user/10min)
  //    Layer 9: Refund Safety (Razorpay API + verify before DB)
  // ═══════════════════════════════════════════════════════
  async cancelBooking(authId: string, bookingId: string, reason?: string, ip?: string) {
    // ── Layer 6: Rate Limiting ──
    this.rateLimiter.check(`user:${authId}:cancel`, RATE_LIMITS.CANCEL);

    // ── Strip HTML from reason ──
    const sanitizedReason = reason ? this.stripHtml(reason) : undefined;

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId) throw new ForbiddenException('Access denied.');

    // ══════════════════════════════════════════════════
    // Layer 2: Idempotency
    // ══════════════════════════════════════════════════
    if (booking.bookingStatus === 'CANCELLED') {
      return {
        success: true,
        message: 'Booking already cancelled.',
        data: { ...booking, displayId: this.formatBookingId(booking.id), refundAmount: 0 },
      };
    }

    if (booking.paymentStatus === 'REFUNDED') {
      return {
        success: true,
        message: 'Already refunded.',
        data: { ...booking, displayId: this.formatBookingId(booking.id), refundAmount: 0 },
      };
    }

    // ── Layer 5: State Machine ──
    if (booking.bookingStatus !== 'CONFIRMED' && booking.bookingStatus !== 'PENDING') {
      throw new BadRequestException('Invalid booking state');
    }

    // ── 2-hour cancellation window ──
    const slotDateTime = this.buildSlotDateTime(
      booking.bookingDate.toISOString().split('T')[0],
      booking.startTime,
    );
    const hoursUntilSlot = (slotDateTime.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilSlot <= 2) {
      throw new BadRequestException('Cannot cancel within 2 hours of slot');
    }

    // ══════════════════════════════════════════════════
    // Layer 9: Refund Safety
    // ══════════════════════════════════════════════════
    let refundAmount = 0;
    let newPaymentStatus: PaymentStatus = booking.paymentStatus;
    let razorpayRefundId: string | null = null;

    // Only refund if payment was actually successful
    if (booking.paymentStatus === 'SUCCESS' && booking.razorpayPaymentId) {
      refundAmount = Math.floor(booking.depositAmount * CANCEL_REFUND_PERCENT);

      const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET') || '';
      const isMockMode = keySecret === 'your_razorpay_key_secret' || keySecret === '';

      if (isMockMode) {
        // Mock refund for testing
        razorpayRefundId = `rfnd_mock_${crypto.randomBytes(6).toString('hex')}`;
        newPaymentStatus = 'REFUNDED' as PaymentStatus;
      } else {
        try {
          // Step 5: Call Razorpay Refund API
          const refund = await this.razorpay.payments.refund(booking.razorpayPaymentId, {
            amount: refundAmount * 100, // paise
            notes: { bookingId, reason: sanitizedReason || 'User cancellation' },
          });

          // Step 6: ONLY update to REFUNDED if Razorpay confirms
          razorpayRefundId = refund.id;
          newPaymentStatus = 'REFUNDED' as PaymentStatus;
        } catch (refundError) {
          // Razorpay failed → cancel booking but DON'T mark as refunded
          console.error(`[REFUND FAILED] bookingId=${bookingId}`, refundError);
          this.paymentLogger.alert('Refund API call failed', {
            bookingId,
            userId: authId,
            error: String(refundError),
          });
          // Keep payment status as-is, just cancel the booking
          newPaymentStatus = booking.paymentStatus;
          refundAmount = 0;
        }
      }
    }
    // If paymentStatus is PENDING or FAILED → cancel without refund

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        bookingStatus: 'CANCELLED',
        paymentStatus: newPaymentStatus,
        cancelledAt: new Date(),
        cancelReason: sanitizedReason || null,
        razorpayRefundId,
      },
    });

    // ── Layer 12 ──
    this.paymentLogger.log({
      userId: authId,
      bookingId,
      turfId: booking.turfId,
      action: refundAmount > 0 ? 'refund' : 'cancel',
      amount: refundAmount,
      razorpayOrderId: booking.razorpayOrderId || undefined,
      razorpayPaymentId: booking.razorpayPaymentId || undefined,
      ip,
      result: 'SUCCESS',
    });

    return {
      success: true,
      message: refundAmount > 0
        ? `Booking cancelled. 75% refund of ₹${booking.depositAmount} → ₹${refundAmount} will be processed.`
        : 'Booking cancelled successfully.',
      data: {
        ...updated,
        displayId: this.formatBookingId(updated.id),
        refundAmount,
      },
    };
  }

  // ═══════════════════════════════════════════════════════
  // 6.5 CRON: MARK NO SHOWS (15 min after slot start)
  //     Cron endpoints protected by CronGuard (Layer 1)
  //     Layer 6: Rate Limiting (1/endpoint/4min)
  // ═══════════════════════════════════════════════════════
  async markNoShows(ip?: string) {
    this.rateLimiter.check(`cron:no-shows:${ip || 'system'}`, RATE_LIMITS.CRON);

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

  // ═══════════════════════════════════════════════════════
  // 6.6 CRON: AUTO-COMPLETE ONLINE BOOKINGS
  // ═══════════════════════════════════════════════════════
  async autoCompleteOnlineBookings(ip?: string) {
    this.rateLimiter.check(`cron:auto-complete:${ip || 'system'}`, RATE_LIMITS.CRON);

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

  // ═══════════════════════════════════════════════════════
  // 7. GET ALL MY BOOKINGS
  //    Layer 11: checkInPin stripped by interceptor
  // ═══════════════════════════════════════════════════════
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

    const mapped = bookings.map((b) => ({
      ...b,
      displayId: this.formatBookingId(b.id),
      // Layer 11: Strip sensitive fields
      checkInPin: undefined,
      pinAttempts: undefined,
      pinLocked: undefined,
    }));

    return { success: true, count: mapped.length, data: mapped };
  }

  // ═══════════════════════════════════════════════════════
  // 8. GET BOOKING DETAILS
  //    Layer 11: PIN visible only for single booking detail (booking owner)
  // ═══════════════════════════════════════════════════════
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
    if (booking.userId !== authId) throw new ForbiddenException('Access denied.');

    return {
      success: true,
      data: {
        ...booking,
        displayId: this.formatBookingId(booking.id),
        // PIN visible for single booking detail
        pinAttempts: undefined,
        pinLocked: undefined,
      },
    };
  }

  // ═══════════════════════════════════════════════════════
  // 9. BOOKINGS BY STATUS (upcoming / past)
  //    Layer 11: Strip PIN
  // ═══════════════════════════════════════════════════════
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

    const mapped = bookings.map((b) => ({
      ...b,
      displayId: this.formatBookingId(b.id),
      checkInPin: undefined,
      pinAttempts: undefined,
      pinLocked: undefined,
    }));

    return { success: true, count: mapped.length, data: mapped };
  }

  // ═══════════════════════════════════════════════════════
  // 10. BOOKINGS BY FILTER (today / tomorrow / week / date)
  //     Layer 11: Strip PIN
  // ═══════════════════════════════════════════════════════
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

    const mapped = bookings.map((b) => ({
      ...b,
      displayId: this.formatBookingId(b.id),
      checkInPin: undefined,
      pinAttempts: undefined,
      pinLocked: undefined,
    }));

    return { success: true, count: mapped.length, data: mapped };
  }

  // ═══════════════════════════════════════════════════════
  // 11. TRANSACTION HISTORY
  //     Layer 11: Strip PIN + mask paymentId
  // ═══════════════════════════════════════════════════════
  async getTransactionHistory(authId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        userId: authId,
        paymentStatus: { in: ['SUCCESS', 'REFUNDED', 'FAILED'] },
      },
      select: {
        id: true, amount: true, depositAmount: true,
        paymentType: true, paymentStatus: true,
        bookingStatus: true, razorpayOrderId: true,
        bookingDate: true, startTime: true, endTime: true,
        createdAt: true, cancelledAt: true,
        turf: { select: { id: true, name: true, city: true, entranceUrl: true } },
      } as any,
      orderBy: { createdAt: 'desc' },
    });

    // Layer 11: DO NOT expose razorpayPaymentId or checkInPin
    const mapped = bookings.map((b: any) => ({
      ...b,
      displayId: this.formatBookingId(b.id),
    }));

    return { success: true, count: mapped.length, data: mapped };
  }

  // ═══════════════════════════════════════════════════════
  // 12. RATE TURF (after COMPLETED booking only)
  //     Layer 2: Idempotency (one rating per booking)
  //     Layer 5: State Machine (must be COMPLETED)
  //     Layer 10: Input validation (DTO)
  // ═══════════════════════════════════════════════════════
  async rateTurf(
    authId: string,
    bookingId: string,
    dto: { rating: number; review?: string },
    ip?: string,
  ) {
    // ── Layer 10: Additional validation ──
    if (!Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 5) {
      throw new BadRequestException('Rating must be an integer between 1 and 5');
    }

    // ── Strip HTML from review ──
    const sanitizedReview = dto.review ? this.stripHtml(dto.review).slice(0, 500) : undefined;

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId) throw new ForbiddenException('Access denied.');

    // ── Layer 5: State Machine ──
    if (booking.bookingStatus !== 'COMPLETED') {
      throw new BadRequestException('You can only rate after completing a visit');
    }

    // ── Layer 2: Idempotency — one rating per booking, lifetime ──
    const existingRating = await this.prisma.turfRating.findUnique({ where: { bookingId } });
    if (existingRating) {
      throw new ConflictException('Already rated');
    }

    const rating = await this.prisma.turfRating.create({
      data: {
        userId: authId,
        turfId: booking.turfId,
        bookingId,
        rating: dto.rating,
        review: sanitizedReview,
      },
    });

    this.paymentLogger.log({
      userId: authId,
      bookingId,
      turfId: booking.turfId,
      action: 'rate',
      ip,
      result: 'SUCCESS',
    });

    return { success: true, message: 'Thank you for your review!', data: rating };
  }

  // ═══════════════════════════════════════════════════════
  // 13. INVOICE
  // ═══════════════════════════════════════════════════════
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
    if (booking.userId !== authId) throw new ForbiddenException('Access denied.');

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
        depositAmount: booking.depositAmount,
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
   * Layer 10: Validate booking inputs server-side
   */
  private validateBookingInputs(dto: {
    bookingDate: string;
    startTime: string;
    endTime: string;
    durationMins: number;
  }): void {
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.bookingDate)) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
    }

    // Validate time format
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.startTime)) {
      throw new BadRequestException('Invalid startTime format. Use HH:MM (24hr).');
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.endTime)) {
      throw new BadRequestException('Invalid endTime format. Use HH:MM (24hr).');
    }

    // endTime > startTime
    if (dto.endTime <= dto.startTime) {
      throw new BadRequestException('endTime must be after startTime');
    }

    // Validate durationMins
    if (dto.durationMins < 60 || dto.durationMins > 360) {
      throw new BadRequestException('Duration must be between 60 and 360 minutes');
    }
    if (dto.durationMins % 30 !== 0) {
      throw new BadRequestException('Duration must be a multiple of 30 minutes');
    }

    // Verify durationMins matches actual time difference
    const [startH, startM] = dto.startTime.split(':').map(Number);
    const [endH, endM] = dto.endTime.split(':').map(Number);
    const calculatedDuration = (endH * 60 + endM) - (startH * 60 + startM);
    if (calculatedDuration !== dto.durationMins) {
      throw new BadRequestException('durationMins does not match startTime/endTime difference');
    }
  }

  /**
   * Calculate price based on weekday/weekend, day/night, duration
   * Layer 4: Amount Integrity — server-side only
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
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  private formatBookingId(uuid: string): string {
    return `TRF-${uuid.slice(0, 7).toUpperCase()}`;
  }

  private buildSlotDateTime(dateSource: string | Date, timeStr: string): Date {
    const dateStr =
      dateSource instanceof Date
        ? dateSource.toISOString().split('T')[0]
        : dateSource;
    return new Date(`${dateStr}T${timeStr}:00`);
  }

  /**
   * Layer 10: Strip HTML tags from user input to prevent XSS
   */
  private stripHtml(str: string): string {
    return str.replace(/<[^>]*>/g, '').trim();
  }
}
