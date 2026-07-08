import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentLoggerService } from '../../common/services/payment-logger.service';
import {
  RateLimiterService,
  RATE_LIMITS,
} from '../../common/services/rate-limiter.service';
import {
  Booking,
  PaymentStatus,
  PaymentType,
  BookingStatus,
} from '@prisma/client';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { Parser } from 'json2csv';
import * as PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import { UserGamificationService } from '../user-gamification/user-gamification.service';
import { EmailService } from '../../common/email/email.service';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { RedisService } from '../../common/redis/redis.service';

// ─── CONSTANTS ───────────────────────────────────────────
const CASH_DEPOSIT_PERCENT = 0.5; // 50% advance for CASH bookings
const CANCEL_REFUND_PERCENT = 0.75; // 75% refund on cancellation
const NIGHT_START_HOUR = 18; // 6 PM onwards = night pricing
const PIN_MAX_ATTEMPTS = 5; // Lock PIN after 5 wrong attempts
const PIN_WINDOW_MINUTES = 10; // ±10 min for PIN verification
const SLOT_LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes reservation window
const MIN_ADVANCE_BOOKING_MINS = 30; // Must book at least 30 minutes before start time

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  private razorpay: Razorpay;
  private readonly isLiveMode: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly paymentLogger: PaymentLoggerService,
    private readonly rateLimiter: RateLimiterService,
    private readonly userGamificationService: UserGamificationService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly metrics: MetricsService,
    private readonly redisService: RedisService,
    @InjectQueue('email') private readonly emailQueue: Queue,
    @InjectQueue('payment-retry') private readonly paymentRetryQueue: Queue,
    @InjectQueue('booking-expiry') private readonly bookingExpiryQueue: Queue,
  ) {
    const keyId = this.configService.get<string>('RAZORPAY_KEY_ID') || '';
    const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET') || '';
    const webhookSecret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') || '';

    // ── Validate Razorpay credentials at startup ──
    if (!keyId || !keySecret) {
      throw new Error('FATAL: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in environment variables.');
    }
    if (!webhookSecret) {
      throw new Error('FATAL: RAZORPAY_WEBHOOK_SECRET must be set in environment variables.');
    }

    this.isLiveMode = keyId.startsWith('rzp_live_');
    if (this.isLiveMode) {
      this.logger.log('Razorpay initialized in LIVE mode.');
    } else if (keyId.startsWith('rzp_test_')) {
      this.logger.warn('Razorpay initialized in TEST mode. Do NOT use in production.');
    } else {
      throw new Error('FATAL: RAZORPAY_KEY_ID must start with rzp_live_ or rzp_test_.');
    }

    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    if (!this.configService.get<string>('QR_SECRET_KEY') || this.configService.get<string>('QR_SECRET_KEY') === 'your_super_secret_qr_key_here') {
      throw new Error('FATAL: QR_SECRET_KEY must be set to a real secret value in environment variables.');
    }
  }

  private normalizeBookingDate(date: string | Date): Date {
    const parsed = typeof date === 'string' ? new Date(date) : new Date(date);
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  private async acquireSlotLock(
    authId: string,
    dto: {
      turfId: string;
      bookingDate: string;
      startTime: string;
      endTime: string;
      durationMins: number;
    },
  ) {
    const bookingDate = this.normalizeBookingDate(dto.bookingDate);
    const now = new Date();

    await this.prisma.slotLock.deleteMany({
      where: {
        turfId: dto.turfId,
        bookingDate,
        expiresAt: { lte: now },
      },
    });

    const overlappingLock = await this.prisma.slotLock.findFirst({
      where: {
        turfId: dto.turfId,
        bookingDate,
        expiresAt: { gt: now },
        startTime: { lt: dto.endTime },
        endTime: { gt: dto.startTime },
      },
      orderBy: { expiresAt: 'desc' },
    });

    const expiresAt = new Date(now.getTime() + SLOT_LOCK_TTL_MS);

    if (overlappingLock) {
      if (
        overlappingLock.userId === authId &&
        overlappingLock.startTime === dto.startTime &&
        overlappingLock.endTime === dto.endTime
      ) {
        return this.prisma.slotLock.update({
          where: { id: overlappingLock.id },
          data: { expiresAt },
        });
      }

      throw new BadRequestException('Slot is being booked by someone else.');
    }

    return this.prisma.slotLock.create({
      data: {
        userId: authId,
        turfId: dto.turfId,
        bookingDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        durationMins: dto.durationMins as any,
        expiresAt,
      },
    });
  }

  private async releaseSlotLockForBooking(booking: Booking) {
    const bookingDate = this.normalizeBookingDate(booking.bookingDate);
    await this.prisma.slotLock.deleteMany({
      where: {
        OR: [
          { bookingId: booking.id },
          {
            turfId: booking.turfId,
            bookingDate,
            startTime: booking.startTime,
            endTime: booking.endTime,
          },
        ],
      },
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
      durationMins?: number;
      paymentType: PaymentType;
      notes?: string;
    },
    ip?: string,
  ) {
    // ── Layer 6: Rate Limiting ──
    await this.rateLimiter.check(
      `user:${authId}:create-booking`,
      RATE_LIMITS.CREATE_BOOKING,
    );

    // ── Layer 10: Additional server-side validation ──
    const lockKey = `booking:lock:${dto.turfId}:${dto.bookingDate}:${dto.startTime}:${dto.endTime}`;
    const lockValue = await this.redisService.acquireLock(lockKey, 30000);
    if (!lockValue) {
      throw new ConflictException(
        'This slot is currently being booked by someone else. Please try again.',
      );
    }
    try {
      // (Consolidated all time-range checks after turf fetch)
      this.validateBasicInputs(dto);

      // ── Strip HTML tags from notes ──
      const sanitizedNotes = dto.notes ? this.stripHtml(dto.notes) : undefined;

      const turf = await this.prisma.turf.findUnique({
        where: { id: dto.turfId },
        include: { owner: true },
      });
      if (!turf) throw new NotFoundException('Turf not found');
      if (turf.status !== 'ACTIVE')
        throw new BadRequestException('Turf is not currently available');

      const bookingDate = new Date(dto.bookingDate);

      // ── Check if Turf is in Maintenance for the bookingDate ──
      const checkDate = new Date(dto.bookingDate);
      checkDate.setHours(12, 0, 0, 0);
      const maintenanceBlock = await this.prisma.turfMaintenance.findFirst({
        where: {
          turfId: dto.turfId,
          startDate: { lte: checkDate },
          endDate: { gte: checkDate },
        },
      });
      if (maintenanceBlock) {
        throw new BadRequestException('Turf is unavailable due to maintenance.');
      }

      // ── Prevent past-date bookings ──
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (bookingDate < today) {
        throw new BadRequestException('Cannot book for a past date');
      }

      // ── Limit booking window to 90 days ──
      const maxBookingDate = new Date(today);
      maxBookingDate.setDate(maxBookingDate.getDate() + 90);
      const bookingDateCheck = new Date(bookingDate);
      bookingDateCheck.setHours(0, 0, 0, 0);
      if (bookingDateCheck > maxBookingDate) {
        throw new BadRequestException('Cannot book slots beyond the 90-day window');
      }

      // ── Enforce minimum 1-hour advance booking for same-day ──
      const now = new Date();
      const bookingDateNorm = new Date(bookingDate);
      bookingDateNorm.setHours(0, 0, 0, 0);
      const todayNorm = new Date(now);
      todayNorm.setHours(0, 0, 0, 0);

      if (bookingDateNorm.getTime() === todayNorm.getTime()) {
        const [sH, sM] = dto.startTime.split(':').map(Number);
        const slotStartMins = sH * 60 + sM;
        const currentMins = now.getHours() * 60 + now.getMinutes();
        const minAdvanceMins = currentMins + MIN_ADVANCE_BOOKING_MINS;

        if (slotStartMins < minAdvanceMins) {
          const cutoffH = Math.floor(minAdvanceMins / 60);
          const cutoffM = minAdvanceMins % 60;
          const cutoffStr = `${cutoffH.toString().padStart(2, '0')}:${cutoffM.toString().padStart(2, '0')}`;
          throw new BadRequestException(
            `Bookings must be made at least 30 minutes in advance. Earliest available start time for today is ${cutoffStr}.`,
          );
        }
      }

      // ── Flexible Operating Hours logic ──
      const is24Hour = turf.openTime === turf.closeTime;
      const isOvernight = turf.closeTime < turf.openTime;

      const isTimeInWindow = (time: string) => {
        if (is24Hour) return true; // Open 24/7
        return isOvernight
          ? time >= turf.openTime || time <= turf.closeTime
          : time >= turf.openTime && time <= turf.closeTime;
      };

      if (!isTimeInWindow(dto.startTime) || !isTimeInWindow(dto.endTime)) {
        throw new BadRequestException(
          `Turf is closed. Operating hours: ${turf.openTime} - ${turf.closeTime}`,
        );
      }

      // Gap check: Ensure booking doesn't cross the closed period (only for non-24h overnight)
      if (
        !is24Hour &&
        isOvernight &&
        dto.startTime <= turf.closeTime &&
        dto.endTime >= turf.openTime
      ) {
        throw new BadRequestException(
          `Turf is closed between ${turf.closeTime} and ${turf.openTime}`,
        );
      }

      // For same-day turfs, ensure start < end
      if (!is24Hour && !isOvernight && dto.startTime >= dto.endTime) {
        throw new BadRequestException('End time must be after start time');
      }

      if (dto.durationMins! < turf.minSlotDurationMins) {
        throw new BadRequestException(
          `Minimum slot duration is ${turf.minSlotDurationMins} minutes`,
        );
      }

      // ── Layer 4: Server-side price calculation (NEVER from client) ──
      const turfPrice = this.calculatePrice(
        turf,
        bookingDate,
        dto.startTime,
        dto.durationMins!,
      );

      // Query active platform fee slabs
      const activeSlabs = await this.prisma.platformFeeSlab.findMany({
        where: { isActive: true },
      });

      // Validation 1: minAmount > maxAmount or negative platformFee
      for (const s of activeSlabs) {
        if (s.minAmount > s.maxAmount) {
          throw new BadRequestException('minAmount cannot be greater than maxAmount');
        }
        if (s.platformFee < 0) {
          throw new BadRequestException('Platform Fee cannot be negative');
        }
      }

      // Validation 2: Slab ranges overlap
      for (let i = 0; i < activeSlabs.length; i++) {
        for (let j = i + 1; j < activeSlabs.length; j++) {
          const s1 = activeSlabs[i];
          const s2 = activeSlabs[j];
          if (s1.minAmount <= s2.maxAmount && s1.maxAmount >= s2.minAmount) {
            throw new BadRequestException('Slab ranges overlap');
          }
        }
      }

      // Validation 3: Find matching slab for booking amount (groundCharge/turfPrice)
      const matchingSlabs = activeSlabs.filter(
        (s) => turfPrice >= s.minAmount && turfPrice <= s.maxAmount,
      );

      // Validation 4: No slab exists
      if (matchingSlabs.length === 0) {
        throw new BadRequestException('No slab exists for this booking amount');
      }

      // Validation 5: Multiple slabs match
      if (matchingSlabs.length > 1) {
        throw new BadRequestException('Multiple slabs match this booking amount');
      }

      const platformFee = matchingSlabs[0].platformFee;
      const amount = turfPrice + platformFee; // Total amount (Ground Charge + Platform Fee)

      // Validate payment preference matching
      let isAllowed = false;
      if (dto.paymentType === PaymentType.FULL_ONLINE && turf.paymentPreferences.includes('FULL_ONLINE')) isAllowed = true;
      if (dto.paymentType === PaymentType.HALF_ONLINE_HALF_CASH && turf.paymentPreferences.includes('ADVANCE_PAYMENT')) isAllowed = true;
      if (dto.paymentType === PaymentType.FULL_CASH && turf.paymentPreferences.includes('FULL_CASH')) isAllowed = true;

      if (!isAllowed) {
        throw new BadRequestException('The selected payment type is not allowed for this turf');
      }

      const depositPercentage = 0.3; // fixed 30% advance deposit rate
      let depositAmount = 0;
      let groundAdvance = 0;
      let onlinePayable = 0;
      let remainingAtTurf = 0;

      if (dto.paymentType === PaymentType.FULL_ONLINE) {
        depositAmount = amount;
        onlinePayable = amount;
        remainingAtTurf = 0;
      } else if (dto.paymentType === PaymentType.HALF_ONLINE_HALF_CASH) {
        groundAdvance = Math.floor(turfPrice * depositPercentage);
        onlinePayable = groundAdvance + platformFee;
        remainingAtTurf = turfPrice - groundAdvance;
        depositAmount = onlinePayable;
      } else if (dto.paymentType === PaymentType.FULL_CASH) {
        onlinePayable = platformFee;
        remainingAtTurf = turfPrice;
        depositAmount = onlinePayable;
      }


      const slotLock = await this.acquireSlotLock(authId, {
        turfId: dto.turfId,
        bookingDate: dto.bookingDate,
        startTime: dto.startTime,
        endTime: dto.endTime,
        durationMins: dto.durationMins as number,
      });

      let booking;
      try {
        booking = await this.prisma.$transaction(async (tx) => {
          // FOR UPDATE lock on conflicting bookings
          const overlapping = await tx.$queryRawUnsafe<any[]>(
            `SELECT id FROM bookings
           WHERE turf_id = $1
           AND booking_date = $2
           AND booking_status IN ('PENDING', 'PENDING_APPROVAL', 'CONFIRMED')
           AND start_time < $3
           AND end_time > $4
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
              groundCharge: turfPrice,
              platformFee,
              depositAmount,
              notes: sanitizedNotes,
              bookingStatus:
                dto.paymentType === PaymentType.FULL_CASH
                  ? turf.bookingApprovalType === 'MANUAL'
                    ? 'PENDING_APPROVAL'
                    : 'CONFIRMED'
                  : 'PENDING',
              paymentStatus: 'PENDING',
            } as any,
          });
        });
      } catch (error) {
        await this.prisma.slotLock.deleteMany({ where: { id: slotLock.id } });
        throw error;
      }

      await this.prisma.slotLock.update({
        where: { id: slotLock.id },
        data: { bookingId: booking.id },
      });

      // For FULL_CASH, we confirm immediately, so release the lock
      if (dto.paymentType === PaymentType.FULL_CASH) {
        await this.releaseSlotLockForBooking(booking);
      }

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

      this.logger.log({
        event: 'booking_created',
        bookingId: booking.id,
        userId: authId,
        amount: booking.amount,
        status: booking.bookingStatus,
      });
      this.metrics.bookingCreatedTotal.inc({
        status: booking.bookingStatus,
        payment_type: booking.paymentType,
      });

      if (booking.bookingStatus === 'CONFIRMED') {
        this.sendBookingConfirmationEmail(booking.id).catch((err) =>
          this.logger.error(
            `[EMAIL] Failed to send confirmation email: ${err.message}`,
          ),
        );

        // ── Push Notification ──
        this.triggerPushNotification(
          booking.userId,
          'Booking Confirmed ✅',
          'Booking Confirmed. Your QR will become available 10 minutes before your slot.',
          {
            type: 'BOOKING_CONFIRMED',
            bookingId: booking.id,
          },
        );

        // ── Notify Owner ──
        this.triggerPushNotification(
          turf.owner.authId,
          'New Booking Received! 💸',
          `You have a new confirmed booking for ${turf.name} at ${booking.startTime}`,
          {
            type: 'NEW_BOOKING_OWNER',
            bookingId: booking.id,
          },
        );
      } else if (booking.bookingStatus === 'PENDING') {
        this.sendPaymentPendingEmail(booking.id).catch((err) =>
          this.logger.error(
            `[EMAIL] Failed to send pending payment email: ${err.message}`,
          ),
        );

        // ── Notify Owner ──
        this.triggerPushNotification(
          turf.owner.authId,
          'Booking Pending ⏳',
          `A customer is performing payment for ${turf.name} at ${booking.startTime}`,
          {
            type: 'NEW_PENDING_OWNER',
            bookingId: booking.id,
          },
        );

        // Add delayed job to booking-expiry queue (5 minutes delay = 300000 ms)
        await this.bookingExpiryQueue.add(
          'expire-booking',
          { bookingId: booking.id },
          { delay: 300000 },
        );
      }

      return {
        success: true,
        message:
          dto.paymentType === PaymentType.HALF_ONLINE_HALF_CASH
            ? `Booking created. Pay deposit (₹${depositAmount}) online. Remaining ₹${remainingAtTurf} at turf.`
            : dto.paymentType === PaymentType.FULL_CASH
              ? `Booking confirmed! Please pay ground charges (₹${remainingAtTurf}) at the turf upon arrival.`
              : `Booking created. Pay full amount (₹${amount}) to confirm.`,
        data: {
          ...booking,
          displayId: this.formatBookingId(booking.id),
          amountToPay: depositAmount,
          remainingAmount: remainingAtTurf,
          groundCharge: turfPrice,
          platformFee,
          totalAmount: amount,
          advanceAmount: groundAdvance,
          remainingAtTurf,
          onlinePayable,
          paymentPreferences: turf.paymentPreferences,
          advancePercentage: 30,
        },
      };
    } finally {
      if (lockValue) await this.redisService.releaseLock(lockKey, lockValue);
    }
  }

  // ═══════════════════════════════════════════════════════
  // 1.2 REBOOK (User)
  //     Clones a previous booking with new date/time
  // ═══════════════════════════════════════════════════════
  async rebook(
    authId: string,
    bookingId: string,
    dto: {
      bookingDate: string;
      startTime?: string;
      endTime?: string;
      durationMins?: number;
      paymentType?: PaymentType;
    },
    ip?: string,
  ) {
    const oldBooking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!oldBooking) {
      throw new NotFoundException('Original booking not found');
    }

    if (oldBooking.userId !== authId) {
      throw new ForbiddenException(
        'You can only rebook your own previous bookings',
      );
    }

    const startTime = dto.startTime || oldBooking.startTime;
    const endTime = dto.endTime || oldBooking.endTime;

    // Calculate duration if not provided
    let durationMins = dto.durationMins;
    if (durationMins === undefined) {
      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);
      durationMins = endH * 60 + endM - (startH * 60 + startM);
    }

    // Prepare new booking data
    const newBookingDto = {
      turfId: oldBooking.turfId,
      bookingDate: dto.bookingDate,
      startTime,
      endTime,
      durationMins,
      paymentType: dto.paymentType || oldBooking.paymentType,
      notes: oldBooking.notes || undefined,
      playersCount: oldBooking.playersCount || undefined,
    };

    return this.createBooking(authId, newBookingDto, ip);
  }

  // ═══════════════════════════════════════════════════════
  // 1.5 GET BOOKED SLOTS (Availability)
  //     Layer 6: Rate Limiting (30/user/1min)
  // ═══════════════════════════════════════════════════════
  async getBookedSlots(turfId: string, date: string, authId?: string) {
    // ── Layer 6: Rate Limiting ──
    if (authId) {
      await this.rateLimiter.check(
        `user:${authId}:availability`,
        RATE_LIMITS.AVAILABILITY,
      );
    }

    const turf = await this.prisma.turf.findUnique({
      where: { id: turfId },
      select: {
        openTime: true,
        closeTime: true,
        weekdayDayPrice: true,
        weekdayNightPrice: true,
        weekendDayPrice: true,
        weekendNightPrice: true,
      },
    });
    if (!turf) throw new NotFoundException('Turf not found');

    const bookingDate = new Date(date);
    bookingDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const maxBookingDate = new Date(today);
    maxBookingDate.setDate(maxBookingDate.getDate() + 90);

    if (bookingDate < today || bookingDate > maxBookingDate) {
      throw new BadRequestException('Requested date is outside the 90-day booking window');
    }

    const checkDate = new Date(bookingDate);
    checkDate.setHours(12, 0, 0, 0);
    const maintenanceBlock = await this.prisma.turfMaintenance.findFirst({
      where: {
        turfId,
        startDate: { lte: checkDate },
        endDate: { gte: checkDate },
      },
    });

    if (maintenanceBlock) {
      const isWeekend = this.isWeekend(bookingDate);
      return {
        success: true,
        data: {
          openTime: turf.openTime,
          closeTime: turf.closeTime,
          underMaintenance: true,
          maintenanceReason: maintenanceBlock.reason || 'Routine Maintenance',
          bookedSlots: [
            {
              startTime: turf.openTime,
              endTime: turf.closeTime,
              isExpired: true,
            },
          ],
          minBookableTime: '24:00',
          pricing: {
            dayPrice: isWeekend ? turf.weekendDayPrice : turf.weekdayDayPrice,
            nightPrice: isWeekend
              ? turf.weekendNightPrice
              : turf.weekdayNightPrice,
            nightStartsAt: `${NIGHT_START_HOUR}:00`,
            isWeekend,
          },
        },
      };
    }

    const bookings = await this.prisma.booking.findMany({
      where: {
        turfId,
        bookingDate,
        bookingStatus: { notIn: ['CANCELLED', 'NO_SHOW' as any, 'REJECTED' as any] },
      },
      select: { startTime: true, endTime: true },
      orderBy: { startTime: 'asc' },
    });

    const isWeekend = this.isWeekend(bookingDate);

    // ── Calculate minimum bookable time for same-day bookings ──
    // Rule: Must book at least 30 minutes BEFORE the slot start time.
    // e.g., For an 11:00 AM slot, booking closes at 10:30 AM.
    // So any slot whose startTime < (now + 30 minutes) is NOT available.
    const now = new Date();
    const todayDate = new Date(now);
    todayDate.setHours(0, 0, 0, 0);
    const requestedDate = new Date(bookingDate);
    requestedDate.setHours(0, 0, 0, 0);

    let minBookableTime: string | null = null;
    const allSlots: {
      startTime: string;
      endTime: string;
      isExpired?: boolean;
    }[] = [...bookings];

    if (requestedDate.getTime() === todayDate.getTime()) {
      const currentMins = now.getHours() * 60 + now.getMinutes();
      const minStartMins = currentMins + MIN_ADVANCE_BOOKING_MINS;
      // Round UP to next 30-minute boundary for clean UX
      const roundedMins = Math.ceil(minStartMins / 30) * 30;
      const h = Math.floor(roundedMins / 60);
      const m = roundedMins % 60;

      if (h >= 24) {
        // All slots have passed for today
        minBookableTime = '24:00';
      } else {
        minBookableTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      }

      // ── Inject a synthetic "unavailable" block from openTime to minBookableTime ──
      // This makes the frontend automatically treat these time slots as booked/taken.
      // The frontend overlap logic will prevent selecting any start time before minBookableTime.
      if (minBookableTime && minBookableTime > turf.openTime) {
        const blockEnd =
          minBookableTime === '24:00' ? turf.closeTime : minBookableTime;
        allSlots.unshift({
          startTime: turf.openTime,
          endTime: blockEnd,
          isExpired: true, // Flag so frontend can distinguish from real bookings
        });
      }
    }

    // Sort all slots (real + synthetic) by startTime
    allSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

    return {
      success: true,
      data: {
        openTime: turf.openTime,
        closeTime: turf.closeTime,
        bookedSlots: allSlots,
        minBookableTime, // null for future dates, "HH:MM" for today
        pricing: {
          dayPrice: isWeekend ? turf.weekendDayPrice : turf.weekdayDayPrice,
          nightPrice: isWeekend
            ? turf.weekendNightPrice
            : turf.weekdayNightPrice,
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
    await this.rateLimiter.check(
      `booking:${bookingId}:create-order`,
      RATE_LIMITS.CREATE_ORDER,
    );

    const idempotencyKey = `idempotent:order:${bookingId}`;
    const isFirst = await this.redisService.setIdempotencyKey(
      idempotencyKey,
      300000,
    );
    if (!isFirst) {
      throw new ConflictException('Order creation is already in progress');
    }

    const lockKey = `payment:lock:order:${bookingId}`;
    const lockValue = await this.redisService.acquireLock(lockKey, 15000);
    if (!lockValue) {
      throw new ConflictException(
        'Please wait for the current operation to finish',
      );
    }

    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
      });
      if (!booking) throw new NotFoundException('Booking not found');

      // ── Layer 1: Verify booking ownership ──
      if (booking.userId !== authId)
        throw new ForbiddenException('Access denied.');

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

      // ── Razorpay minimum amount validation (₹1 = 100 paise) ──
      if (amountInPaise < 100) {
        throw new BadRequestException('Minimum payable amount is ₹1');
      }

      // ── Create Razorpay order ──
      let order: any;
      try {
        order = await this.razorpay.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt: `TRF-${booking.id.slice(0, 7)}`,
          notes: {
            bookingId: booking.id,
            turfId: booking.turfId,
            paymentType: booking.paymentType,
          },
          payment_capture: true, // Auto-capture payment on success
        });
      } catch (rzpError) {
        this.logger.error(
          `[RAZORPAY] Order creation failed for booking ${bookingId}: ${rzpError?.message || rzpError}`,
        );
        this.paymentLogger.log({
          userId: authId,
          bookingId,
          turfId: booking.turfId,
          action: 'create-order',
          amount: booking.depositAmount,
          ip,
          result: 'FAILED',
          rejectionReason: `Razorpay API error: ${rzpError?.message || 'Unknown'}`,
        });
        throw new HttpException(
          'Payment gateway is temporarily unavailable. Please try again.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

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
      this.metrics.paymentInitiatedTotal.inc();

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
    } finally {
      if (lockValue) await this.redisService.releaseLock(lockKey, lockValue);
    }
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
    await this.rateLimiter.check(
      `booking:${bookingId}:confirm-payment`,
      RATE_LIMITS.CONFIRM_PAYMENT,
    );

    const idempotencyKey = `idempotent:confirm:${bookingId}`;
    const isFirst = await this.redisService.setIdempotencyKey(
      idempotencyKey,
      300000,
    );
    if (!isFirst) {
      throw new ConflictException(
        'Payment confirmation is already in progress',
      );
    }

    const lockKey = `payment:lock:confirm:${bookingId}`;
    const lockValue = await this.redisService.acquireLock(lockKey, 15000);
    if (!lockValue) {
      throw new ConflictException(
        'Please wait for the current operation to finish',
      );
    }

    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: { turf: { include: { owner: true } } },
      });
      if (!booking) throw new NotFoundException('Booking not found');

      // ── Layer 1: Verify ownership ──
      if (booking.userId !== authId)
        throw new ForbiddenException('Access denied.');

      // ══════════════════════════════════════════════════
      // Layer 2: Idempotency — already confirmed/completed?
      // ══════════════════════════════════════════════════
      if (
        booking.bookingStatus === 'CONFIRMED' ||
        booking.bookingStatus === 'COMPLETED'
      ) {
        await this.releaseSlotLockForBooking(booking);
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
      const keySecret =
        this.configService.get<string>('RAZORPAY_KEY_SECRET') || '';

      {
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

          this.metrics.paymentFailedTotal.inc();
          throw new BadRequestException('Invalid payment signature');
        }

        // Step 3: Verify orderId matches DB-stored orderId
        if (
          booking.razorpayOrderId &&
          dto.razorpayOrderId !== booking.razorpayOrderId
        ) {
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
          const rzpOrder = await this.razorpay.orders.fetch(
            dto.razorpayOrderId,
          );
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
          this.logger.warn(
            `[PAYMENT] Could not fetch Razorpay order for amount verification: ${err.message || err}`,
          );
        }
      }

      // ── Update booking atomically ──
      const newPaymentStatus =
        booking.paymentType === PaymentType.FULL_ONLINE ? 'SUCCESS' : 'PENDING';

      const updated = await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          bookingStatus: 'CONFIRMED',
          paymentStatus: newPaymentStatus,
          razorpayOrderId: dto.razorpayOrderId,
          razorpayPaymentId: dto.razorpayPaymentId,
        },
      });

      await this.releaseSlotLockForBooking(updated);

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

      this.logger.log({
        event: 'payment_verified',
        userId: authId,
        bookingId,
        amount: booking.depositAmount,
        razorpayOrderId: dto.razorpayOrderId,
        razorpayPaymentId: dto.razorpayPaymentId,
      });
      this.metrics.paymentVerifiedTotal.inc();

      this.sendBookingConfirmationEmail(updated.id).catch((err) =>
        this.logger.error(
          `[EMAIL] Failed to send confirmation email: ${err.message}`,
        ),
      );

      // ── Push Notification ──
      const isPartial =
        booking.paymentType === PaymentType.HALF_ONLINE_HALF_CASH;
      this.triggerPushNotification(
        updated.userId,
        isPartial ? 'Advance Paid 💳' : 'Booking Confirmed ✅',
        isPartial
          ? 'Your advance payment is successful. Pay remaining at venue. Your QR will become available 10 minutes before your slot.'
          : 'Booking Confirmed. Your QR will become available 10 minutes before your slot.',
        {
          type: isPartial ? 'PAYMENT_PARTIAL' : 'BOOKING_CONFIRMED',
          bookingId: updated.id,
        },
      );

      // ── Notify Owner ──
      this.triggerPushNotification(
        booking.turf.owner.authId,
        'Payment Received! 💰',
        `Advance payment received for ${booking.turf.name} at ${booking.startTime}`,
        {
          type: 'PAYMENT_RECEIVED_OWNER',
          bookingId: updated.id,
        },
      );

      return {
        success: true,
        message:
          booking.paymentType === PaymentType.HALF_ONLINE_HALF_CASH
            ? `Deposit paid. Booking confirmed! Pay remaining ₹${booking.amount - booking.depositAmount} at turf. Your QR will become available 10 minutes before your slot.`
            : `Payment successful. Booking confirmed! Your QR will become available 10 minutes before your slot.`,
        data: { ...updated, displayId: this.formatBookingId(updated.id) },
      };
    } finally {
      if (lockValue) await this.redisService.releaseLock(lockKey, lockValue);
    }
  }

  async reconcilePayment(
    bookingId: string,
    paymentId?: string,
    orderId?: string,
  ) {
    this.logger.log(`Starting payment reconciliation for booking ${bookingId}`);

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { turf: { include: { owner: true } } },
    });

    if (!booking) {
      throw new NotFoundException(`Booking ${bookingId} not found`);
    }

    // 1. Idempotency Check: Check if the payment is already reconciled
    if (
      booking.bookingStatus === 'CONFIRMED' ||
      booking.bookingStatus === 'COMPLETED'
    ) {
      this.logger.log(
        `Booking ${bookingId} is already confirmed or completed.`,
      );
      return { success: true, message: 'Already reconciled' };
    }

    const rzpOrderId = orderId || booking.razorpayOrderId;
    const rzpPaymentId = paymentId || booking.razorpayPaymentId;

    if (!rzpOrderId) {
      throw new BadRequestException(
        `No Razorpay Order ID found for booking ${bookingId}`,
      );
    }

    // 2. Fetch order status from Razorpay
    const rzpOrder = await this.razorpay.orders.fetch(rzpOrderId);
    if (rzpOrder.status !== 'paid') {
      throw new Error(
        `Razorpay order status is '${rzpOrder.status}', not 'paid'`,
      );
    }

    // Verify Amount Integrity
    const expectedAmountPaise = Math.round(booking.depositAmount * 100);
    if (rzpOrder.amount !== expectedAmountPaise) {
      this.paymentLogger.alert(
        'Amount mismatch detected during reconciliation',
        {
          bookingId: booking.id,
          dbAmount: expectedAmountPaise,
          rzpAmount: rzpOrder.amount,
        },
      );
      throw new BadRequestException('Amount mismatch detected');
    }

    // Find a captured payment for this order if paymentId not provided
    let resolvedPaymentId = rzpPaymentId;
    if (!resolvedPaymentId) {
      const payments = await this.razorpay.orders.fetchPayments(rzpOrderId);
      const capturedPayment = payments.items?.find(
        (p: any) => p.status === 'captured',
      );
      if (!capturedPayment) {
        throw new Error(
          `No captured payment found for Razorpay order ${rzpOrderId}`,
        );
      }
      resolvedPaymentId = capturedPayment.id;
    }

    // 3. Update booking atomically
    const newPaymentStatus =
      booking.paymentType === PaymentType.FULL_ONLINE ? 'SUCCESS' : 'PENDING';

    const updated = await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        bookingStatus: 'CONFIRMED',
        paymentStatus: newPaymentStatus,
        razorpayPaymentId: resolvedPaymentId,
      },
    });

    await this.releaseSlotLockForBooking(updated);

    // Trigger confirmation email
    await this.sendBookingConfirmationEmail(updated.id);

    // Trigger push notification to user
    const isPartial = booking.paymentType === PaymentType.HALF_ONLINE_HALF_CASH;
    await this.triggerPushNotification(
      updated.userId,
      isPartial ? 'Advance Paid 💳' : 'Booking Confirmed ✅',
      isPartial
        ? 'Your advance payment is successful. Pay remaining at venue. Your QR will become available 10 minutes before your slot.'
        : 'Booking Confirmed. Your QR will become available 10 minutes before your slot.',
      {
        type: isPartial ? 'PAYMENT_PARTIAL' : 'BOOKING_CONFIRMED',
        bookingId: updated.id,
      },
    );

    // Trigger push notification to owner
    if (booking.turf?.owner?.authId) {
      await this.triggerPushNotification(
        booking.turf.owner.authId,
        'Payment Confirmed! 💳',
        `Payment successful via reconciliation for ${booking.turf.name} at ${booking.startTime}`,
        {
          type: 'PAYMENT_RECEIVED_OWNER',
          bookingId: updated.id,
        },
      );
    }

    this.paymentLogger.log({
      userId: booking.userId,
      bookingId: booking.id,
      turfId: booking.turfId,
      action: 'confirm',
      amount: booking.depositAmount,
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: resolvedPaymentId,
      result: 'SUCCESS',
    });

    return { success: true, message: 'Reconciled successfully' };
  }

  async handleBookingExpiration(bookingId: string) {
    this.logger.log(`Checking expiration for booking ${bookingId}`);

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      this.logger.warn(
        `Booking ${bookingId} not found during expiration check.`,
      );
      return { success: false, message: 'Booking not found' };
    }

    // If the booking is still PENDING, we cancel/expire it
    if (booking.bookingStatus === 'PENDING') {
      this.logger.log(`Booking ${bookingId} is still PENDING. Expiring...`);

      const updated = await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          bookingStatus: 'CANCELLED',
          paymentStatus: 'FAILED',
          cancelledAt: new Date(),
          cancelReason: 'Payment window expired / Timeout',
        },
      });

      // Release the slot lock
      await this.releaseSlotLockForBooking(updated);

      this.paymentLogger.log({
        userId: booking.userId,
        bookingId: booking.id,
        turfId: booking.turfId,
        action: 'cancel',
        amount: 0,
        ip: 'system',
        result: 'SUCCESS',
      });

      this.logger.log(`Booking ${bookingId} has been successfully expired.`);
      return { success: true, message: 'Booking expired' };
    }

    this.logger.log(
      `Booking ${bookingId} is not PENDING (Status: ${booking.bookingStatus}). No expiration needed.`,
    );
    return { success: true, message: 'No expiration needed' };
  }

  // ═══════════════════════════════════════════════════════
  // 2.1 RAZORPAY WEBHOOK (SERVER-TO-SERVER)
  //     Layer 3: Signature verification (timingSafeEqual)
  //     Layer 4: Amount integrity
  //     Layer 5: State machine (PENDING → CONFIRMED)
  // ═══════════════════════════════════════════════════════
  async handleRazorpayWebhook(
    payload: any,
    signature: string | undefined,
    rawBody: Buffer | undefined,
    ip?: string,
  ) {
    const webhookSecret =
      this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') ||
      this.configService.get<string>('RAZORPAY_KEY_SECRET') ||
      '';

    this.metrics.webhookReceivedTotal.inc();

    if (!webhookSecret) {
      throw new BadRequestException('Webhook secret is not configured');
    }

    if (!signature) {
      throw new BadRequestException('Missing Razorpay webhook signature');
    }
    if (!rawBody) {
      throw new BadRequestException(
        'Missing webhook payload for signature verification',
      );
    }

    let signatureValid = false;
    try {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');
      const expectedBuf = Buffer.from(expectedSignature, 'hex');
      const receivedBuf = Buffer.from(signature, 'hex');

      signatureValid =
        expectedBuf.length === receivedBuf.length &&
        crypto.timingSafeEqual(expectedBuf, receivedBuf);
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      this.paymentLogger.alert('Webhook signature verification failed', {
        ip,
        event: payload?.event ?? 'unknown',
        accountId: payload?.account_id ?? 'unknown',
      });
      throw new BadRequestException('Invalid Razorpay webhook signature');
    }

    const event = payload?.event;
    // ── Handle payment.failed event ──
    if (event === 'payment.failed') {
      const failedPayment = payload?.payload?.payment?.entity;
      if (failedPayment) {
        const failedOrderId = failedPayment.order_id;
        if (failedOrderId) {
          const failedBooking = await this.prisma.booking.findFirst({
            where: { razorpayOrderId: failedOrderId, bookingStatus: 'PENDING' },
          });
          if (failedBooking) {
            this.logger.warn({
              event: 'razorpay_payment_failed_webhook',
              bookingId: failedBooking.id,
              orderId: failedOrderId,
              errorCode: failedPayment.error_code,
              errorDescription: failedPayment.error_description,
            });
            this.paymentLogger.log({
              userId: failedBooking.userId,
              bookingId: failedBooking.id,
              turfId: failedBooking.turfId,
              action: 'failed',
              amount: failedBooking.depositAmount,
              razorpayOrderId: failedOrderId,
              ip,
              result: 'FAILED',
              rejectionReason: failedPayment.error_description || failedPayment.error_code || 'Payment failed via webhook',
            });
            this.metrics.paymentFailedTotal.inc();
          }
        }
      }
      return { success: true, message: 'Payment failure recorded' };
    }

    if (!event || !['payment.captured', 'order.paid'].includes(event)) {
      return {
        success: true,
        message: `Webhook event '${event ?? 'unknown'}' ignored`,
      };
    }

    const paymentEntity = payload?.payload?.payment?.entity;
    if (!paymentEntity) {
      throw new BadRequestException('Webhook payload missing payment entity');
    }

    if (paymentEntity.status !== 'captured') {
      return {
        success: true,
        message: `Payment status '${paymentEntity.status}' ignored`,
      };
    }

    const orderId = paymentEntity.order_id;
    const paymentId = paymentEntity.id;
    const notes = paymentEntity.notes || {};
    const bookingIdFromNotes =
      typeof notes.bookingId === 'string'
        ? notes.bookingId
        : typeof notes.booking_id === 'string'
          ? notes.booking_id
          : undefined;

    let booking: any = null;

    try {
      if (bookingIdFromNotes) {
        booking = await this.prisma.booking.findUnique({
          where: { id: bookingIdFromNotes },
          include: { turf: { include: { owner: true } } },
        });
      }
      if (!booking && orderId) {
        booking = await this.prisma.booking.findFirst({
          where: { razorpayOrderId: orderId },
          include: { turf: { include: { owner: true } } },
        });
      }

      if (!booking) {
        this.paymentLogger.alert('Webhook booking not found', {
          orderId,
          paymentId,
          event,
          ip,
        });
        throw new NotFoundException('Booking not found for Razorpay webhook');
      }

      if (
        booking.bookingStatus === 'CONFIRMED' ||
        booking.bookingStatus === 'COMPLETED'
      ) {
        if (!booking.razorpayPaymentId) {
          await this.prisma.booking.update({
            where: { id: booking.id },
            data: { razorpayPaymentId: paymentId },
          });
        }
        await this.releaseSlotLockForBooking(booking);
        return {
          success: true,
          message: 'Booking already confirmed.',
        };
      }

      if (booking.razorpayPaymentId) {
        throw new ConflictException('Payment already recorded for booking');
      }

      if (booking.bookingStatus !== 'PENDING') {
        throw new BadRequestException(
          'Invalid booking state for webhook payment',
        );
      }

      if (
        booking.razorpayOrderId &&
        orderId &&
        booking.razorpayOrderId !== orderId
      ) {
        this.paymentLogger.alert('Webhook order ID tampered', {
          bookingId: booking.id,
          expected: booking.razorpayOrderId,
          received: orderId,
          ip,
        });
        throw new BadRequestException('Order ID mismatch');
      }

      const expectedAmountPaise = Math.round(booking.depositAmount * 100);
      if (orderId) {
        try {
          const rzpOrder = await this.razorpay.orders.fetch(orderId);
          if (rzpOrder.amount !== expectedAmountPaise) {
            this.paymentLogger.alert('Amount mismatch detected via webhook', {
              bookingId: booking.id,
              dbAmount: expectedAmountPaise,
              rzpAmount: rzpOrder.amount,
              ip,
            });
            throw new BadRequestException('Amount mismatch detected');
          }
        } catch (err) {
          if (err instanceof BadRequestException) {
            throw err;
          }
          this.logger.warn(
            `[PAYMENT] Could not fetch Razorpay order for webhook verification: ${err.message || err}`,
          );
        }
      }

      const newPaymentStatus =
        booking.paymentType === PaymentType.FULL_ONLINE ? 'SUCCESS' : 'PENDING';

      const isManual = booking.turf?.bookingApprovalType === 'MANUAL';
      const targetStatus = isManual ? 'PENDING_APPROVAL' : 'CONFIRMED';

      const updated = await this.prisma.booking.update({
        where: { id: booking.id },
        data: {
          bookingStatus: targetStatus,
          paymentStatus: newPaymentStatus,
          razorpayOrderId: orderId || booking.razorpayOrderId,
          razorpayPaymentId: paymentId,
        },
      });

      await this.releaseSlotLockForBooking(updated);

      this.paymentLogger.log({
        userId: booking.userId,
        bookingId: booking.id,
        turfId: booking.turfId,
        action: isManual ? 'pending_approval' : 'confirm',
        amount: booking.depositAmount,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        ip,
        result: 'SUCCESS',
      });

      this.logger.log({
        event: 'razorpay_webhook_processed',
        bookingId: booking.id,
        paymentId,
        orderId,
        status: updated.bookingStatus,
      });
      this.metrics.paymentVerifiedTotal.inc();

      if (!isManual) {
        this.sendBookingConfirmationEmail(updated.id).catch((err) =>
          this.logger.error(
            `[EMAIL] Failed to send confirmation email: ${err.message}`,
          ),
        );
      }

      // ── Push Notification ──
      const isPartialWebhook =
        booking.paymentType === PaymentType.HALF_ONLINE_HALF_CASH;

      if (isManual) {
        // Customer Notification
        this.triggerPushNotification(
          updated.userId,
          'Booking Pending Approval ⏳',
          'Your payment was successful. Waiting for owner confirmation.',
          {
            type: 'BOOKING_PENDING_APPROVAL',
            bookingId: updated.id,
          },
        );

        // Owner Notification
        if (booking.turf?.owner?.authId) {
          this.triggerPushNotification(
            booking.turf.owner.authId,
            'New Booking Request',
            `New booking request received for ${booking.turf.name} at ${booking.startTime}`,
            {
              type: 'NEW_BOOKING_REQUEST',
              bookingId: updated.id,
            },
          );
        }
      } else {
        // Customer Notification
        this.triggerPushNotification(
          updated.userId,
          isPartialWebhook ? 'Advance Paid 💳' : 'Booking Confirmed ✅',
          isPartialWebhook
            ? 'Your advance payment is successful. Pay remaining at venue. Your QR will become available 10 minutes before your slot.'
            : 'Booking Confirmed. Your QR will become available 10 minutes before your slot.',
          {
            type: isPartialWebhook ? 'PAYMENT_PARTIAL' : 'BOOKING_CONFIRMED',
            bookingId: updated.id,
          },
        );

        // Owner Notification
        if (booking.turf?.owner?.authId) {
          this.triggerPushNotification(
            booking.turf.owner.authId,
            'New Booking Confirmed',
            `New booking confirmed for ${booking.turf.name} at ${booking.startTime}`,
            {
              type: 'PAYMENT_RECEIVED_OWNER',
              bookingId: updated.id,
            },
          );
        }
      }

      return {
        success: true,
        message: 'Razorpay webhook processed.',
        data: { ...updated, displayId: this.formatBookingId(updated.id) },
      };
    } catch (err) {
      this.logger.error(
        `[WEBHOOK_ERROR] Webhook processing failed. Enqueuing payment-retry job. Error: ${err.message || err}`,
      );

      const targetBookingId = booking?.id || bookingIdFromNotes;
      if (targetBookingId) {
        await this.paymentRetryQueue.add('retry-payment', {
          bookingId: targetBookingId,
          paymentId,
          orderId,
        });
        this.logger.log(
          `Enqueued payment-retry job for booking ${targetBookingId}`,
        );
      }

      return {
        success: true,
        message: 'Webhook error encountered. Enqueued for asynchronous retry.',
      };
    }
  }

  // ═══════════════════════════════════════════════════════
  // 3. MARK PAYMENT FAILED
  //    Layer 2: Idempotency
  //    Layer 5: State Machine (PENDING → CANCELLED)
  //    Layer 6: Rate Limiting (5/user/10min)
  // ═══════════════════════════════════════════════════════
  async failOnlinePayment(authId: string, bookingId: string, ip?: string) {
    // ── Layer 6: Rate Limiting ──
    await this.rateLimiter.check(
      `user:${authId}:payment-failed`,
      RATE_LIMITS.PAYMENT_FAILED,
    );

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId)
      throw new ForbiddenException('Access denied.');

    // ── Layer 5: State Machine ──
    if (booking.bookingStatus !== 'PENDING') {
      throw new BadRequestException('Invalid booking state');
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: 'FAILED',
        razorpayPaymentId: null,
      },
    });

    await this.releaseSlotLockForBooking(updated);

    // ── Layer 12 ──
    this.paymentLogger.log({
      userId: authId,
      bookingId,
      turfId: booking.turfId,
      action: 'failed',
      amount: booking.depositAmount,
      razorpayOrderId: booking.razorpayOrderId || undefined,
      ip,
      result: 'FAILED',
      rejectionReason: 'Payment attempt failed, booking remains pending',
    });

    return {
      success: true,
      message:
        'Payment failed. Booking is still pending—retry payment to confirm.',
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
  // ─── QR Code Check-In Helpers ───
  async generateCheckInQrCode(booking: any, windowEnd: Date): Promise<string> {
    const secret = this.configService.get<string>('QR_SECRET_KEY') || 'default-qr-secret-key';
    const payload = {
      bookingId: booking.id,
      customerId: booking.userId,
      bookingReference: this.formatBookingId(booking.id),
      issuedAt: new Date().toISOString(),
      expiresAt: windowEnd.toISOString(),
      randomNonce: crypto.randomBytes(16).toString('hex'),
    };
    const payloadString = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    const qrData = JSON.stringify({ payload, signature });
    return QRCode.toDataURL(qrData);
  }

  async verifyCheckInQr(ownerAuthId: string, qrData: string, ip?: string) {
    let parsed: any;
    try {
      parsed = JSON.parse(qrData);
    } catch {
      throw new BadRequestException('Invalid QR code format');
    }

    const { payload, signature } = parsed;
    if (!payload || !signature || !payload.bookingId || !payload.customerId || !payload.expiresAt) {
      throw new BadRequestException('Invalid QR code structure');
    }

    const bookingId = payload.bookingId;

    // ── Rate Limiting ──
    await this.rateLimiter.check(
      `booking:${bookingId}:verify-qr`,
      RATE_LIMITS.VERIFY_PIN,
    );

    const lockKey = `payment:lock:qr:${bookingId}`;
    const lockValue = await this.redisService.acquireLock(lockKey, 15000);
    if (!lockValue) {
      throw new ConflictException(
        'Check-in is currently being processed. Please try again.',
      );
    }

    try {
      // Validate signature
      const secret = this.configService.get<string>('QR_SECRET_KEY') || 'default-qr-secret-key';
      const payloadString = JSON.stringify(payload);
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');

      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expectedSignature);
      const isSignatureValid =
        sigBuf.length === expBuf.length &&
        crypto.timingSafeEqual(sigBuf, expBuf);

      if (!isSignatureValid) {
        this.paymentLogger.log({
          userId: ownerAuthId,
          bookingId,
          action: 'verify-qr',
          ip,
          result: 'REJECTED',
          rejectionReason: 'QR Code signature tampering detected',
        });
        throw new BadRequestException('Invalid QR signature or tampered QR');
      }

      // Check expiration time inside the QR payload
      const now = new Date();
      const qrExpiry = new Date(payload.expiresAt);
      if (now > qrExpiry) {
        throw new BadRequestException('QR Expired');
      }

      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        include: { turf: { include: { owner: true } } },
      });

      if (!booking) throw new NotFoundException('Booking not found');

      // Verify booking belongs to scanned Turf owner
      if (booking.turf.owner.authId !== ownerAuthId) {
        throw new ForbiddenException('Access denied. Scanned turf owner mismatch.');
      }

      // Verify booking status is CONFIRMED
      if (booking.bookingStatus === 'COMPLETED') {
        throw new ConflictException('QR Code has already been used.');
      }
      if (booking.bookingStatus !== 'CONFIRMED') {
        throw new BadRequestException('Invalid booking state');
      }

      // Verify time window validation (reusing same logic)
      const datePart = booking.bookingDate.toISOString().split('T')[0];
      const isOvernight = booking.startTime > booking.endTime;
      const slotStart = this.buildSlotDateTime(datePart, booking.startTime);
      const slotEnd = this.buildSlotDateTime(
        datePart,
        booking.endTime,
        isOvernight ? 1 : 0,
      );

      const windowStart = new Date(
        slotStart.getTime() - PIN_WINDOW_MINUTES * 60 * 1000,
      );
      const windowEnd = new Date(
        slotEnd.getTime() + PIN_WINDOW_MINUTES * 60 * 1000,
      );

      if (now < windowStart) {
        throw new BadRequestException(
          `Check-in window opens at ${windowStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
        );
      }
      if (now > windowEnd) {
        throw new BadRequestException('Check-in window expired');
      }

      const atomicUpdate = await this.prisma.booking.updateMany({
        where: { id: bookingId, bookingStatus: 'CONFIRMED' },
        data: {
          paymentStatus: 'SUCCESS',
          bookingStatus: 'COMPLETED',
          visitedAt: now,
          checkedInByOwnerId: ownerAuthId,
          scanIpAddress: ip || null,
        },
      });

      if (atomicUpdate.count === 0) {
        throw new ConflictException('Booking has already been processed.');
      }

      const updated = await this.prisma.booking.findUnique({
        where: { id: bookingId },
      });

      await this.userGamificationService.handleBookingCompletion(
        booking.userId,
        bookingId,
      );

      const checkInTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // ── Trigger notifications ──
      // Customer: Checked in successfully.
      this.triggerPushNotification(
        booking.userId,
        'Check-in successful 🎉',
        `Check-in successful at ${checkInTime}.`,
        {
          type: 'CHECK_IN_SUCCESS',
          bookingId,
        },
      ).catch((err) =>
        this.logger.error(`[NOTIFICATION] Failed to send customer check-in notification: ${err.message}`),
      );

      // Owner: Customer checked in.
      this.triggerPushNotification(
        ownerAuthId,
        'Customer checked in ✅',
        `Customer checked in successfully at ${checkInTime}.`,
        {
          type: 'CHECK_IN_OWNER',
          bookingId,
        },
      ).catch((err) =>
        this.logger.error(`[NOTIFICATION] Failed to send owner check-in notification: ${err.message}`),
      );

      // Security log
      this.paymentLogger.log({
        userId: ownerAuthId,
        bookingId,
        turfId: booking.turfId,
        action: 'verify-qr',
        ip,
        result: 'SUCCESS',
      });

      return {
        success: true,
        message: 'Check-in successful',
        data: updated,
      };
    } finally {
      await this.redisService.releaseLock(lockKey, lockValue);
    }
  }



  // ═══════════════════════════════════════════════════════
  // 5. MANUAL CHECK-IN (Owner Override)
  //    Layer 1: Owner + turf verification
  //    Layer 5: State Machine (CONFIRMED → COMPLETED)
  // ═══════════════════════════════════════════════════════
  async manualCheckIn(ownerAuthId: string, bookingId: string, reason: string, ip?: string) {
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
      throw new BadRequestException('Only confirmed bookings can be checked-in');
    }

    // ── Time Window Check ──
    // Manual check-in is allowed ONLY during the same QR validity window
    const now = new Date();
    const datePart = booking.bookingDate.toISOString().split('T')[0];
    const isOvernight = booking.startTime > booking.endTime;
    const slotStart = this.buildSlotDateTime(datePart, booking.startTime);
    const slotEnd = this.buildSlotDateTime(
      datePart,
      booking.endTime,
      isOvernight ? 1 : 0,
    );

    const windowStart = new Date(
      slotStart.getTime() - PIN_WINDOW_MINUTES * 60 * 1000,
    );
    const windowEnd = new Date(
      slotEnd.getTime() + PIN_WINDOW_MINUTES * 60 * 1000,
    );

    if (now < windowStart) {
      throw new BadRequestException(
        `Check-in window opens at ${windowStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
      );
    }
    if (now > windowEnd) {
      throw new BadRequestException('Check-in window expired');
    }

    // ── Audit Log via Notes ──
    const auditLogEntry = `\n[MANUAL CHECK-IN] Reason: ${reason}. By Owner at ${now.toISOString()}. IP: ${ip || 'unknown'}`;
    const newNotes = (booking.notes || '') + auditLogEntry;

    const atomicUpdate = await this.prisma.booking.updateMany({
      where: { id: bookingId, bookingStatus: 'CONFIRMED' },
      data: {
        bookingStatus: 'COMPLETED',
        paymentStatus: 'SUCCESS', // For CASH fallback, we assume money collected
        visitedAt: now,
        notes: newNotes,
        checkedInByOwnerId: ownerAuthId,
        scanIpAddress: ip || null,
      },
    });

    if (atomicUpdate.count === 0) {
      throw new ConflictException('Booking has already been checked-in.');
    }

    const updated = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!updated) {
      throw new NotFoundException('Booking not found after update');
    }

    await this.userGamificationService.handleBookingCompletion(
      updated.userId,
      bookingId,
    );

    this.paymentLogger.log({
      userId: ownerAuthId,
      bookingId,
      turfId: booking.turfId,
      action: 'manual-checkin',
      ip,
      result: 'SUCCESS',
      rejectionReason: reason,
    });

    // ── Push Notification ──
    this.triggerPushNotification(
      updated.userId,
      'Check-in successful ✔',
      'You have been manually checked in by the turf owner. Enjoy your game!',
      {
        type: 'MANUAL_CHECKIN_CUSTOMER',
        bookingId: updated.id,
      },
    ).catch(e => this.logger.error(`Notification error: ${e.message}`));

    // ── Notify Owner ──
    this.triggerPushNotification(
      ownerAuthId,
      'Manual Check-in Saved ✅',
      `You've manually checked in ${this.formatBookingId(updated.id)}. Reason logged.`,
      {
        type: 'MANUAL_CHECKIN_OWNER',
        bookingId: updated.id,
      },
    ).catch(e => this.logger.error(`Notification error: ${e.message}`));

    return {
      success: true,
      message: 'Booking manually checked in and logged.',
      data: { ...updated, displayId: this.formatBookingId(updated.id) },
    };
  }

  // ═══════════════════════════════════════════════════════
  // 5.5 OWNER: GET ALL BOOKINGS FOR OWNED TURFS
  //     Layer 1: OWNER role + turf ownership filtering
  // ═══════════════════════════════════════════════════════
  async getOwnerBookings(ownerAuthId: string) {
    const bookings = await this.prisma.booking.findMany({
      take: 100, // Maximum cap to prevent DoS via OOM exhaustion
      where: {
        turf: {
          owner: { authId: ownerAuthId },
        },
      },
      include: {
        user: {
          select: { phone: true, userProfile: { select: { name: true } } },
        },
        turf: { select: { name: true, city: true } },
      },
      orderBy: { bookingDate: 'desc' },
    });

    return {
      success: true,
      data: bookings.map((b) => ({
        ...b,
        displayId: this.formatBookingId(b.id),
        userName: b.user?.userProfile?.name || 'Customer',
        userPhone: b.user?.phone,
      })),
    };
  }

  // ═══════════════════════════════════════════════════════
  // 5.6 OWNER: FILTERED BOOKINGS
  //     Layer 1: Filter by date/status for specific owner
  // ═══════════════════════════════════════════════════════
  async getOwnerBookingsFiltered(
    ownerAuthId: string,
    query: {
      status?: 'upcoming' | 'past';
      time?: 'today' | 'tomorrow' | 'week';
      date?: string;
    },
  ) {
    const { status, time, date } = query;
    const where: any = {
      turf: { owner: { authId: ownerAuthId } },
    };

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Status filtering
    if (status === 'upcoming') {
      where.bookingDate = { gte: new Date(todayStr) };
      where.bookingStatus = { in: ['CONFIRMED', 'PENDING', 'PENDING_APPROVAL'] };
    } else if (status === 'past') {
      where.bookingStatus = { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'REJECTED'] };
    }

    // Date/Filter logic
    if (date) {
      where.bookingDate = new Date(date);
    } else if (time === 'today') {
      where.bookingDate = new Date(todayStr);
    } else if (time === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      where.bookingDate = new Date(tomorrow.toISOString().split('T')[0]);
    } else if (time === 'week') {
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);
      where.bookingDate = {
        gte: new Date(todayStr),
        lte: new Date(weekEnd.toISOString().split('T')[0]),
      };
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        user: {
          select: { phone: true, userProfile: { select: { name: true } } },
        },
        turf: { select: { name: true, city: true } },
      },
      orderBy: { bookingDate: 'asc' },
    });

    return {
      success: true,
      data: bookings.map((b) => ({
        ...b,
        displayId: this.formatBookingId(b.id),
        userName: b.user?.userProfile?.name || 'Customer',
        userPhone: b.user?.phone,
      })),
    };
  }

  // ═══════════════════════════════════════════════════════
  // 5.7 OWNER: GET SINGLE BOOKING DETAILS
  // ═══════════════════════════════════════════════════════
  async getOwnerBookingDetails(ownerAuthId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: {
          select: {
            phone: true,
            userProfile: { select: { name: true, email: true } },
          },
        },
        turf: { include: { owner: true } },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.turf.owner.authId !== ownerAuthId) {
      throw new ForbiddenException('Access denied.');
    }

    return {
      success: true,
      data: {
        ...booking,
        displayId: this.formatBookingId(booking.id),
        userName: booking.user?.userProfile?.name || 'Customer',
        userPhone: booking.user?.phone,
        userEmail: booking.user?.userProfile?.email,
      },
    };
  }

  // ═══════════════════════════════════════════════════════
  // 5.8 OWNER: GET ACTIVE BOOKINGS (TODAY)
  // ═══════════════════════════════════════════════════════
  async getOwnerActiveBookings(ownerAuthId: string) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const bookings = await this.prisma.booking.findMany({
      where: {
        turf: { owner: { authId: ownerAuthId } },
        bookingDate: today,
        bookingStatus: { in: ['CONFIRMED', 'PENDING'] },
      },
      include: {
        user: {
          select: { phone: true, userProfile: { select: { name: true } } },
        },
        turf: { select: { name: true, city: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    return {
      success: true,
      count: bookings.length,
      data: bookings.map((b) => ({
        ...b,
        displayId: this.formatBookingId(b.id),
        userName: b.user?.userProfile?.name || 'Customer',
        userPhone: b.user?.phone,
      })),
    };
  }

  // ═══════════════════════════════════════════════════════
  // 5.9 OWNER: GET ANALYTICS
  // ═══════════════════════════════════════════════════════
  async getOwnerAnalytics(ownerAuthId: string) {
    const turfs = await this.prisma.turf.findMany({
      where: { owner: { authId: ownerAuthId } },
      select: { id: true, name: true },
    });

    const turfIds = turfs.map((t) => t.id);

    const bookings = await this.prisma.booking.findMany({
      where: { turfId: { in: turfIds } },
    });

    const totalBookings = bookings.length;
    const completed = bookings.filter(
      (b) => b.bookingStatus === 'COMPLETED',
    ).length;
    const cancelled = bookings.filter(
      (b) => b.bookingStatus === 'CANCELLED',
    ).length;
    const noShow = bookings.filter((b) => b.bookingStatus === 'NO_SHOW').length;

    const totalRevenue = bookings
      .filter((b) => b.bookingStatus === 'COMPLETED')
      .reduce((sum, b) => sum + b.amount, 0);

    const pendingRevenue = bookings
      .filter(
        (b) => b.bookingStatus === 'CONFIRMED' || b.bookingStatus === 'PENDING',
      )
      .reduce((sum, b) => sum + (b.amount - b.depositAmount), 0);

    const todayStr = new Date().toISOString().split('T')[0];

    return {
      success: true,
      data: {
        counts: {
          total: totalBookings,
          completed,
          cancelled,
          noShow,
          activeToday: bookings.filter(
            (b) =>
              b.bookingDate.toISOString().split('T')[0] === todayStr &&
              ['CONFIRMED', 'PENDING'].includes(b.bookingStatus),
          ).length,
        },
        revenue: {
          total: totalRevenue,
          pending: pendingRevenue,
        },
        turfs: turfs.map((t) => ({
          ...t,
          bookingCount: bookings.filter((b) => b.turfId === t.id).length,
        })),
      },
    };
  }

  // ═══════════════════════════════════════════════════════
  // 5.10 OWNER: EXPORT CSV
  // ═══════════════════════════════════════════════════════
  async getOwnerAnalyticsCsv(ownerAuthId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { turf: { owner: { authId: ownerAuthId } } },
      include: {
        turf: { select: { name: true } },
        user: {
          select: { phone: true, userProfile: { select: { name: true } } },
        },
      },
      orderBy: { bookingDate: 'desc' },
    });

    const fields = [
      { label: 'Booking ID', value: 'id' },
      {
        label: 'Date',
        value: (row: any) => row.bookingDate.toISOString().split('T')[0],
      },
      { label: 'Start Time', value: 'startTime' },
      { label: 'End Time', value: 'endTime' },
      { label: 'Total Amount', value: 'amount' },
      { label: 'Deposit', value: 'depositAmount' },
      { label: 'Payment', value: 'paymentType' },
      { label: 'Status', value: 'bookingStatus' },
      { label: 'Turf', value: 'turf.name' },
      { label: 'Customer', value: 'user.userProfile.name' },
      { label: 'Phone', value: 'user.phone' },
    ];

    const parser = new Parser({ fields });
    return parser.parse(bookings);
  }

  // ═══════════════════════════════════════════════════════
  // 5.11 OWNER: EXPORT PDF
  // ═══════════════════════════════════════════════════════
  async getOwnerAnalyticsPdf(ownerAuthId: string): Promise<Buffer> {
    const analytics = await this.getOwnerAnalytics(ownerAuthId);
    const bookings = await this.prisma.booking.findMany({
      where: { turf: { owner: { authId: ownerAuthId } } },
      include: { turf: { select: { name: true } } },
      orderBy: { bookingDate: 'desc' },
      take: 30,
    });

    return new Promise((resolve, reject) => {
      const doc = new (PDFDocument as any)({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc
        .fontSize(24)
        .fillColor('#2E7D32')
        .text('Turfsy Analytics Report', { align: 'center' });
      doc
        .fontSize(10)
        .fillColor('#666')
        .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(2);

      // Summary Box
      doc.rect(50, doc.y, 500, 100).fill('#f5f5f5');
      doc
        .fillColor('#000')
        .fontSize(16)
        .text('Business Overview', 70, doc.y + 10);
      doc.fontSize(12);
      doc.text(
        `Total Revenue: INR ${analytics.data.revenue.total}`,
        70,
        doc.y + 25,
      );
      doc.text(
        `Total Bookings: ${analytics.data.counts.total}`,
        70,
        doc.y + 15,
      );
      doc.text(
        `Completed: ${analytics.data.counts.completed} | Cancelled: ${analytics.data.counts.cancelled}`,
        70,
        doc.y + 15,
      );

      doc.y = 230; // Reset Y after box
      doc.moveDown(2);

      // Recent Activity
      doc
        .fontSize(16)
        .fillColor('#2E7D32')
        .text('Recent Activity', { underline: true });
      doc.moveDown();

      doc.fontSize(9).fillColor('#333');
      bookings.forEach((b, i) => {
        const d = b.bookingDate.toISOString().split('T')[0];
        doc.text(
          `${i + 1}. [${d}] ${b.startTime}-${b.endTime} | ${b.turf.name} | INR ${b.amount} | ${b.bookingStatus}`,
        );
        doc.moveDown(0.5);
      });

      doc.end();
    });
  }

  // ═══════════════════════════════════════════════════════
  // 6. CANCEL BOOKING
  //    Layer 2: Idempotency (already cancelled/refunded?)
  //    Layer 5: State Machine
  //    Layer 6: Rate Limiting (3/user/10min)
  //    Layer 9: Refund Safety (Razorpay API + verify before DB)
  // ═══════════════════════════════════════════════════════
  async cancelBooking(
    authId: string,
    bookingId: string,
    reason?: string,
    ip?: string,
  ) {
    // ── Layer 6: Rate Limiting ──
    await this.rateLimiter.check(`user:${authId}:cancel`, RATE_LIMITS.CANCEL);

    // ── Strip HTML from reason ──
    const sanitizedReason = reason ? this.stripHtml(reason) : undefined;

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { turf: { include: { owner: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId)
      throw new ForbiddenException('Access denied.');

    // ══════════════════════════════════════════════════
    // Layer 2: Idempotency
    // ══════════════════════════════════════════════════
    if (booking.bookingStatus === 'CANCELLED') {
      return {
        success: true,
        message: 'Booking already cancelled.',
        data: {
          ...booking,
          displayId: this.formatBookingId(booking.id),
          refundAmount: 0,
        },
      };
    }

    if (booking.paymentStatus === 'REFUNDED') {
      return {
        success: true,
        message: 'Already refunded.',
        data: {
          ...booking,
          displayId: this.formatBookingId(booking.id),
          refundAmount: 0,
        },
      };
    }

    // ── Layer 5: State Machine ──
    if (
      booking.bookingStatus !== 'CONFIRMED' &&
      booking.bookingStatus !== 'PENDING'
    ) {
      throw new BadRequestException('Invalid booking state');
    }

    // ── 2-hour cancellation window ──
    const slotDateTime = this.buildSlotDateTime(
      booking.bookingDate.toISOString().split('T')[0],
      booking.startTime,
    );
    const hoursUntilSlot =
      (slotDateTime.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilSlot <= booking.turf.cancellationAllowedBeforeHours) {
      throw new BadRequestException(
        `Cannot cancel within ${booking.turf.cancellationAllowedBeforeHours} hours of slot`,
      );
    }

    // ══════════════════════════════════════════════════
    // Layer 9: Refund Safety
    // ══════════════════════════════════════════════════
    let refundAmount = 0;
    let newPaymentStatus: PaymentStatus =
      booking.paymentStatus === 'PENDING' ? 'FAILED' : booking.paymentStatus;
    let razorpayRefundId: string | null = null;

    // Only refund if payment was actually successful
    if (booking.paymentStatus === 'SUCCESS' && booking.razorpayPaymentId) {
      refundAmount = Math.floor(
        booking.depositAmount *
          (booking.turf.cancellationRefundPercentage / 100),
      );

      if (refundAmount > 0) {
        try {
          const refund = await this.razorpay.payments.refund(
            booking.razorpayPaymentId,
            {
              amount: refundAmount * 100, // paise
              notes: {
                bookingId,
                reason: sanitizedReason || 'User cancellation',
              },
            },
          );

          razorpayRefundId = refund.id;
          newPaymentStatus = 'REFUNDED' as PaymentStatus;
        } catch (refundError) {
          // Razorpay failed → cancel booking but DON'T mark as refunded
          this.logger.error(
            `[REFUND FAILED] bookingId=${bookingId}`,
            refundError?.stack || refundError,
          );
          this.paymentLogger.alert('Refund API call failed', {
            bookingId,
            userId: authId,
            error: String(refundError),
          });
          this.metrics.refundTotal.inc({ status: 'failed' });
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

    // Clean up split if exists
    await this.prisma.bookingSplit.deleteMany({
      where: { bookingId },
    });

    await this.releaseSlotLockForBooking(updated);

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

    this.logger.log({
      event: 'booking_cancelled',
      bookingId: updated.id,
      userId: authId,
      refundAmount,
      reason: sanitizedReason || 'User Request',
    });
    this.metrics.bookingCancelledTotal.inc();
    if (refundAmount > 0) {
      this.metrics.refundTotal.inc({ status: 'success' });
    }

    this.sendCancellationEmail(
      updated.id,
      sanitizedReason || 'User Request',
    ).catch((err) =>
      this.logger.error(
        `[EMAIL] Failed to send cancellation email: ${err.message}`,
      ),
    );

    // ── Notify Owner ──
    if (booking.turf?.owner?.authId) {
      this.triggerPushNotification(
        booking.turf.owner.authId,
        'Booking Cancelled! 🚨',
        `${booking.turf.name} slot at ${booking.startTime} was cancelled by the customer.`,
        {
          type: 'BOOKING_CANCELLED_OWNER',
          bookingId: updated.id,
        },
      );
    }

    return {
      success: true,
      message:
        refundAmount > 0
          ? `Booking cancelled. ${booking.turf.cancellationRefundPercentage}% refund of ₹${booking.depositAmount} → ₹${refundAmount} will be processed.`
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
    await this.rateLimiter.check(
      `cron:no-shows:${ip || 'system'}`,
      RATE_LIMITS.CRON,
    );

    // Filter to only check bookings from today or earlier to optimize query
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const confirmedBookings = await this.prisma.booking.findMany({
      where: {
        bookingStatus: 'CONFIRMED',
        bookingDate: { lte: today },
      },
      include: { turf: { include: { owner: true } } },
    });

    let updatedCount = 0;

    for (const booking of confirmedBookings) {
      const isOvernight = booking.startTime > booking.endTime;
      const slotEnd = this.buildSlotDateTime(
        booking.bookingDate.toISOString().split('T')[0],
        booking.endTime,
        isOvernight ? 1 : 0,
      );

      // No-show if 20 minutes past slot end time
      const noShowThreshold = new Date(slotEnd.getTime() + 20 * 60 * 1000);

      if (now > noShowThreshold) {
        await this.prisma.booking.update({
          where: { id: booking.id },
          data: { bookingStatus: 'NO_SHOW' as any },
        });

        // ── Gamification Penalty & Push ──
        await this.userGamificationService
          .handleNoShow(booking.userId, booking.id)
          .catch((err) =>
            this.logger.error(
              `[GAMIFICATION] Failed to handle no-show: ${err.message}`,
            ),
          );

        updatedCount++;
        this.sendNoShowEmail(booking.id).catch((err) =>
          this.logger.error(
            `[EMAIL] Failed to send no-show email: ${err.message}`,
          ),
        );

        // ── Notify Customer ──
        this.triggerPushNotification(
          booking.userId,
          'Booking marked as No Show ⚠️',
          'Booking marked as No Show.',
          {
            type: 'NO_SHOW_CUSTOMER',
            bookingId: booking.id,
          },
        ).catch((err) =>
          this.logger.error(`[NOTIFICATION] Failed to notify customer about no-show: ${err.message}`),
        );

        // ── Notify Owner ──
        if (booking.turf?.owner?.authId) {
          this.triggerPushNotification(
            booking.turf.owner.authId,
            'Customer did not check in ⚠️',
            'Customer did not check in.',
            {
              type: 'NO_SHOW_OWNER',
              bookingId: booking.id,
            },
          ).catch((err) =>
            this.logger.error(`[NOTIFICATION] Failed to notify owner about no-show: ${err.message}`),
          );
        }
      }
    }

    return {
      success: true,
      count: updatedCount,
      message: `Marked ${updatedCount} bookings as NO_SHOW`,
    };
  }

  // ═══════════════════════════════════════════════════════
  // 6.6 CRON: AUTO-COMPLETE ONLINE BOOKINGS
  // ═══════════════════════════════════════════════════════
  async autoCompleteOnlineBookings(ip?: string) {
    await this.rateLimiter.check(
      `cron:auto-complete:${ip || 'system'}`,
      RATE_LIMITS.CRON,
    );

    const confirmedOnline = await this.prisma.booking.findMany({
      where: {
        bookingStatus: 'CONFIRMED',
        paymentType: PaymentType.FULL_ONLINE,
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
        const atomicUpdate = await this.prisma.booking.updateMany({
          where: { id: booking.id, bookingStatus: 'CONFIRMED' },
          data: { bookingStatus: 'COMPLETED', visitedAt: slotEnd },
        });

        if (atomicUpdate.count > 0) {
          await this.userGamificationService.handleBookingCompletion(
            booking.userId,
            booking.id,
          );
          updatedCount++;
        }
      }
    }

    return {
      success: true,
      count: updatedCount,
      message: `Auto-completed ${updatedCount} online bookings`,
    };
  }

  // ═══════════════════════════════════════════════════════
  // 6.7 CRON: UPCOMING CHECK-IN NOTIFICATIONS
  // ═══════════════════════════════════════════════════════
  async handleUpcomingCheckInNotifications(ip?: string) {
    await this.rateLimiter.check(
      `cron:upcoming-checkins:${ip || 'system'}`,
      RATE_LIMITS.CRON,
    );

    const now = new Date();
    // Calculate target time (10 minutes from now in IST)
    const tenMinsFromNow = new Date(now.getTime() + 10 * 60 * 1000);

    const istTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(tenMinsFromNow);

    // Get today's date at 00:00:00 for the database query
    // We use Asia/Kolkata date to match how bookings are stored
    const istDateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    const today = new Date(istDateStr);

    const upcomingBookings = await this.prisma.booking.findMany({
      where: {
        bookingStatus: 'CONFIRMED',
        bookingDate: today,
        startTime: istTime,
      },
      include: {
        turf: {
          select: {
            name: true,
            owner: { select: { authId: true } },
          },
        },
      },
    });

    let sentCount = 0;
    for (const booking of upcomingBookings) {
      const ownerAuthId = booking.turf?.owner?.authId;
      if (!ownerAuthId) continue;

      try {
        await this.notificationsService.sendNotification(
          ownerAuthId,
          'Guest Arriving Soon! 🏃‍♂️',
          `The PIN verification window for ${booking.turf.name} at ${booking.startTime} is now OPEN.`,
          {
            type: 'PIN_WINDOW_OPEN',
            bookingId: booking.id,
            startTime: booking.startTime,
          },
        );
        sentCount++;
      } catch (err) {
        this.logger.error(`[NOTIFICATION_CRON_ERROR] ${err.message}`);
      }
    }

    return {
      success: true,
      count: sentCount,
      message: `Notifications sent to ${sentCount} owners for upcoming bookings.`,
    };
  }

  // ═══════════════════════════════════════════════════════
  // 7. GET ALL MY BOOKINGS
  //    Layer 11: checkInPin stripped by interceptor
  // ═══════════════════════════════════════════════════════
  async getMyBookings(authId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        OR: [
          { userId: authId },
          {
            bookingSplit: {
              players: {
                some: { userId: authId },
              },
            },
          },
        ],
      },
      include: {
        turf: {
          select: {
            id: true,
            name: true,
            city: true,
            address: true,
            sportsType: true,
            entranceUrl: true,
            groundDayUrl: true,
            owner: { select: { name: true, contactNumber: true } },
          },
        },
        rating: true,
      },
      orderBy: { bookingDate: 'desc' },
    });

    const mapped = bookings.map((b) => ({
      ...b,
      bookingStatus: this.mapBookingStatus(b),
      displayId: this.formatBookingId(b.id),
      // Layer 11: Strip sensitive fields
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
            id: true,
            name: true,
            city: true,
            address: true,
            pincode: true,
            sportsType: true,
            turfSize: true,
            lat: true,
            lng: true,
            entranceUrl: true,
            groundDayUrl: true,
            groundNightUrl: true,
            floodLights: true,
            parking: true,
            washroom: true,
            weekdayDayPrice: true,
            weekdayNightPrice: true,
            weekendDayPrice: true,
            weekendNightPrice: true,
            owner: { select: { name: true, contactNumber: true } },
          },
        },
        rating: true,
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId)
      throw new ForbiddenException('Access denied.');

    const now = new Date();
    const datePart = booking.bookingDate.toISOString().split('T')[0];
    const isOvernight = booking.startTime > booking.endTime;
    const slotStart = this.buildSlotDateTime(datePart, booking.startTime);
    const slotEnd = this.buildSlotDateTime(
      datePart,
      booking.endTime,
      isOvernight ? 1 : 0,
    );

    const windowStart = new Date(
      slotStart.getTime() - PIN_WINDOW_MINUTES * 60 * 1000,
    );
    const windowEnd = new Date(
      slotEnd.getTime() + PIN_WINDOW_MINUTES * 60 * 1000,
    );

    let qrStatus = 'INACTIVE';
    let qrMessage = '';
    let qrCode: string | null = null;

    if (booking.bookingStatus === 'COMPLETED') {
      qrStatus = 'COMPLETED';
      qrMessage = 'Checked in successfully.';
    } else if (booking.bookingStatus === 'CONFIRMED') {
      if (now < windowStart) {
        qrStatus = 'UPCOMING';
        qrMessage = 'QR will be available 10 minutes before your booking.';
      } else if (now > windowEnd) {
        qrStatus = 'EXPIRED';
        qrMessage = 'QR Expired';
      } else {
        qrStatus = 'ACTIVE';
        qrMessage = 'Show this QR at the turf to check in.';
        try {
          qrCode = await this.generateCheckInQrCode(booking, windowEnd);
        } catch (err) {
          this.logger.error(`Failed to generate QR code: ${err.message}`);
        }
      }
    } else if (booking.bookingStatus === 'CANCELLED' || booking.bookingStatus === 'REJECTED') {
      qrStatus = 'CANCELLED';
      qrMessage = 'Booking cancelled/rejected.';
    } else if (booking.bookingStatus === 'NO_SHOW') {
      qrStatus = 'NO_SHOW';
      qrMessage = 'Booking marked as No Show.';
    } else {
      qrStatus = 'PENDING';
      qrMessage = 'Waiting for confirmation/approval.';
    }

    return {
      success: true,
      data: {
        ...booking,
        bookingStatus: this.mapBookingStatus(booking),
        displayId: this.formatBookingId(booking.id),
        qrStatus,
        qrMessage,
        qrCode,
      },
    };
  }

  // ═══════════════════════════════════════════════════════
  // 8.5 GET ACTIVE BOOKING (TODAY)
  //     Layer 11: Strip PIN logic handled by mapper
  // ═══════════════════════════════════════════════════════
  async getActiveBookingToday(authId: string) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const bookings = await this.prisma.booking.findMany({
      where: {
        userId: authId,
        bookingDate: today,
        bookingStatus: { in: ['CONFIRMED', 'PENDING'] },
      },
      include: {
        turf: {
          select: {
            id: true,
            name: true,
            city: true,
            address: true,
            sportsType: true,
            entranceUrl: true,
            groundDayUrl: true,
            owner: { select: { name: true, contactNumber: true } },
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    return {
      success: true,
      count: bookings.length,
      data: bookings.map((b) => ({
        ...b,
        bookingStatus: this.mapBookingStatus(b),
        displayId: this.formatBookingId(b.id),
      })),
    };
  }

  // ═══════════════════════════════════════════════════════
  // 9. BOOKINGS BY STATUS (upcoming / past)
  //    Layer 11: Strip PIN
  // ═══════════════════════════════════════════════════════
  async getBookingsByStatus(authId: string, status: 'upcoming' | 'past') {
    const now = new Date();

    // Today in IST/Local
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
            id: true,
            name: true,
            city: true,
            address: true,
            sportsType: true,
            entranceUrl: true,
            groundDayUrl: true,
            owner: { select: { name: true, contactNumber: true } },
          },
        },
        rating: true,
      },
      orderBy: { bookingDate: status === 'upcoming' ? 'asc' : 'desc' },
    });

    const filtered = bookings.filter((b) => {
      const slotEnd = this.buildSlotDateTime(b.bookingDate, b.endTime);
      if (status === 'upcoming') {
        // If it's confirmed/pending but the slot has already ended, it's not "upcoming"
        return slotEnd > now;
      } else {
        // If it's a past date or already marked as past status, it belongs here
        // OR if it's today but the slot has already ended, it also belongs here
        return (
          ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(b.bookingStatus) ||
          slotEnd <= now
        );
      }
    });

    const mapped = filtered.map((b) => ({
      ...b,
      bookingStatus: this.mapBookingStatus(b),
      displayId: this.formatBookingId(b.id),
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
      startDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
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
            id: true,
            name: true,
            city: true,
            address: true,
            sportsType: true,
            entranceUrl: true,
            groundDayUrl: true,
            owner: { select: { name: true, contactNumber: true } },
          },
        },
        rating: true,
      },
      orderBy: { bookingDate: 'asc' },
    });

    const mapped = bookings.map((b) => ({
      ...b,
      bookingStatus: this.mapBookingStatus(b),
      displayId: this.formatBookingId(b.id),
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
        id: true,
        amount: true,
        depositAmount: true,
        paymentType: true,
        paymentStatus: true,
        bookingStatus: true,
        razorpayOrderId: true,
        playersCount: true,
        bookingDate: true,
        startTime: true,
        endTime: true,
        createdAt: true,
        cancelledAt: true,
        turf: {
          select: { id: true, name: true, city: true, entranceUrl: true },
        },
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
      throw new BadRequestException(
        'Rating must be an integer between 1 and 5',
      );
    }

    // ── Strip HTML from review ──
    const sanitizedReview = dto.review
      ? this.stripHtml(dto.review).slice(0, 500)
      : undefined;

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId)
      throw new ForbiddenException('Access denied.');

    // ── Layer 5: State Machine ──
    if (booking.bookingStatus !== 'COMPLETED') {
      throw new BadRequestException(
        'You can only rate after completing a visit',
      );
    }

    // ── Layer 2: Idempotency — one rating per booking, lifetime ──
    const existingRating = await this.prisma.turfRating.findUnique({
      where: { bookingId },
    });
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

    // Update the averageRating and totalReviews on the Turf
    const aggregations = await this.prisma.turfRating.aggregate({
      where: { turfId: booking.turfId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const newAvg = aggregations._avg.rating ? Math.round(aggregations._avg.rating * 10) / 10 : 0;
    const newCount = aggregations._count.rating ?? 0;

    await this.prisma.turf.update({
      where: { id: booking.turfId },
      data: {
        averageRating: newAvg,
        totalReviews: newCount,
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

    return {
      success: true,
      message: 'Thank you for your review!',
      data: rating,
    };
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
            name: true,
            city: true,
            address: true,
            pincode: true,
            sportsType: true,
            owner: { select: { name: true, contactNumber: true, email: true } },
          },
        },
        user: {
          select: {
            phone: true,
            userProfile: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== authId)
      throw new ForbiddenException('Access denied.');

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

  // ═══════════════════════════════════════════════════════
  // 12. GET INVOICE PDF
  // ═══════════════════════════════════════════════════════
  async getInvoicePdf(authId: string, bookingId: string): Promise<Buffer> {
    const invoice = await this.getInvoice(authId, bookingId);
    const data = invoice.data;

    return new Promise((resolve, reject) => {
      const doc = new (PDFDocument as any)({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // --- LOGO / HEADER ---
      doc.fillColor('#2E7D32').fontSize(28).text('TURFSY', { align: 'right' });
      doc
        .fillColor('#444')
        .fontSize(10)
        .text('Premium Turf Booking Platform', { align: 'right' });
      doc.moveDown();

      // --- INVOICE INFO ---
      doc.fillColor('#000').fontSize(20).text('INVOICE', 50, 100);
      doc.fontSize(10).text(`Invoice No: ${data.invoiceId}`, 50, 130);
      doc.text(`Booking ID: ${data.bookingId}`, 50, 145);
      doc.text(`Issued Date: ${new Date().toLocaleDateString()}`, 50, 160);

      // --- BILLING SECTION ---
      doc.rect(50, 180, 500, 1).fill('#EEE'); // Horizontal Line

      doc.fontSize(12).fillColor('#2E7D32').text('Billed By:', 50, 200);
      doc.fillColor('#000').fontSize(14).text(data.turf.name, 50, 215);
      doc.fontSize(10).text(data.turf.address, 50, 235);
      doc.text(`${data.turf.city} - ${data.turf.pincode || ''}`, 50, 250);
      doc.text(`Contact: ${data.turf.owner.contactNumber}`, 50, 265);

      doc.fontSize(12).fillColor('#2E7D32').text('Billed To:', 300, 200);
      doc.fillColor('#000').fontSize(14).text(data.customer.name, 300, 215);
      doc.fontSize(10).text(`Phone: ${data.customer.phone}`, 300, 235);
      doc.text(`Email: ${data.customer.email}`, 300, 250);

      // --- TABLE HEADER ---
      doc.rect(50, 300, 500, 25).fill('#2E7D32');
      doc.fillColor('#FFF').fontSize(10).text('Description', 70, 308);
      doc.text('Slot Details', 250, 308);
      doc.text('Amount', 450, 308);

      // --- TABLE ROWS ---
      doc
        .fillColor('#000')
        .fontSize(11)
        .text(`Turf Booking - ${data.turf.sportsType}`, 70, 340);
      doc
        .fontSize(9)
        .text(`${new Date(data.bookingDate).toDateString()}`, 250, 340);
      doc.text(data.slot, 250, 355);
      doc.fontSize(11).text(`INR ${data.amount}`, 450, 340);

      doc.rect(50, 380, 500, 1).fill('#EEE');

      // --- SUMMARY ---
      const summaryY = 400;
      doc.fontSize(10).text('Payment Type:', 350, summaryY);
      doc.text(data.paymentType, 450, summaryY);

      doc.text('Booking Status:', 350, summaryY + 15);
      doc
        .fillColor(data.bookingStatus === 'CANCELLED' ? '#D32F2F' : '#2E7D32')
        .text(data.bookingStatus, 450, summaryY + 15);

      doc
        .fillColor('#000')
        .fontSize(12)
        .text('TOTAL PAID:', 350, summaryY + 40);
      doc
        .fontSize(14)
        .text(`INR ${data.depositAmount || data.amount}`, 450, summaryY + 38);

      // --- FOOTER ---
      doc
        .fontSize(10)
        .fillColor('#777')
        .text('Thank you for choosing Turfsy!', 50, 700, { align: 'center' });
      doc
        .fontSize(8)
        .text(
          'This is a computer generated invoice and does not require a physical signature.',
          50,
          715,
          { align: 'center' },
        );

      doc.end();
    });
  }

  // ─── HELPERS ───────────────────────────────────────────

  /**
   * Layer 10: Validate booking inputs server-side
   */
  private validateBasicInputs(dto: {
    bookingDate: string;
    startTime: string;
    endTime: string;
    durationMins?: number;
  }): void {
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.bookingDate)) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
    }

    // Validate time format
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.startTime)) {
      throw new BadRequestException(
        'Invalid startTime format. Use HH:MM (24hr).',
      );
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.endTime)) {
      throw new BadRequestException(
        'Invalid endTime format. Use HH:MM (24hr).',
      );
    }

    // ── Duration Integrity Validation (Supports Midnight Crossing) ──
    const [startH, startM] = dto.startTime.split(':').map(Number);
    const [endH, endM] = dto.endTime.split(':').map(Number);

    const totalStartMins = startH * 60 + startM;
    const totalEndMins = endH * 60 + endM;

    let computedDuration: number;

    if (totalEndMins >= totalStartMins) {
      // Same-day booking
      computedDuration = totalEndMins - totalStartMins;
    } else {
      // Cross-midnight booking (1440 mins/day)
      computedDuration = 1440 - totalStartMins + totalEndMins;
    }

    // ── Auto-calculation logic ──
    const duration = dto.durationMins ?? computedDuration;
    if (
      dto.durationMins !== undefined &&
      dto.durationMins !== null &&
      computedDuration !== dto.durationMins
    ) {
      throw new BadRequestException(
        `durationMins (${dto.durationMins}) does not match startTime/endTime difference (${computedDuration})`,
      );
    }

    // Update DTO for downstream use
    (dto as any).durationMins = duration;

    // Validate duration basic range
    if (duration < 60 || duration > 360) {
      throw new BadRequestException(
        'Duration must be between 60 and 360 minutes',
      );
    }
    if (duration % 30 !== 0) {
      throw new BadRequestException(
        'Duration must be a multiple of 30 minutes',
      );
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

  private buildSlotDateTime(
    dateSource: string | Date,
    timeStr: string,
    dayOffset = 0,
  ): Date {
    const rawDate =
      dateSource instanceof Date ? dateSource : new Date(dateSource);

    const date = new Date(rawDate);
    if (dayOffset !== 0) {
      date.setDate(date.getDate() + dayOffset);
    }

    const dateStr = date.toISOString().split('T')[0];
    // Enforce IST timezone for correct comparison with current server time
    return new Date(`${dateStr}T${timeStr}:00+05:30`);
  }

  /**
   * Helper to map status based on time (synthetic status for UI)
   */
  private mapBookingStatus(booking: any): string {
    if (booking.bookingStatus !== 'CONFIRMED') {
      return booking.bookingStatus;
    }

    const now = new Date();
    const slotEnd = this.buildSlotDateTime(
      booking.bookingDate,
      booking.endTime,
      0,
    );

    // If current time exceeds slot end time, show as NO_SHOW
    if (now > slotEnd) {
      return 'NO_SHOW';
    }

    return booking.bookingStatus;
  }

  /**
   * Layer 10: Strip HTML tags from user input to prevent XSS
   */
  private stripHtml(str: string): string {
    return str.replace(/<[^>]*>/g, '').trim();
  }

  // ═══════════════════════════════════════════════════════
  // EMAIL HELPERS
  // ═══════════════════════════════════════════════════════
  private async sendBookingConfirmationEmail(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: { include: { userProfile: true } },
        turf: true,
      },
    });

    if (!booking || !booking.user?.userProfile?.email) return;

    await this.emailQueue.add('send-booking-confirmation', {
      email: booking.user.userProfile.email,
      bookingData: {
        id: booking.id,
        turfName: booking.turf.name,
        date: booking.bookingDate.toISOString().split('T')[0],
        startTime: booking.startTime,
        endTime: booking.endTime,
        amount: booking.amount,
        paymentStatus: booking.paymentStatus,
      },
    });
  }

  private async sendCancellationEmail(bookingId: string, reason: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: { include: { userProfile: true } },
        turf: true,
      },
    });

    if (!booking || !booking.user?.userProfile?.email) return;

    let refundAmount = 0;
    if (booking.paymentStatus === 'REFUNDED') {
      refundAmount = Math.floor(
        booking.depositAmount *
          (booking.turf.cancellationRefundPercentage / 100),
      );
    }

    await this.emailQueue.add('send-booking-cancellation', {
      email: booking.user.userProfile.email,
      bookingData: {
        turfName: booking.turf.name,
        date: booking.bookingDate.toISOString().split('T')[0],
        startTime: booking.startTime,
        amount: booking.amount,
        refundAmount,
        reason,
      },
    });
  }

  private async sendPaymentPendingEmail(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: { include: { userProfile: true } },
        turf: true,
      },
    });

    if (!booking || !booking.user?.userProfile?.email) return;

    const expiryTime = new Date(
      booking.createdAt.getTime() + SLOT_LOCK_TTL_MS,
    ).toLocaleTimeString();

    await this.emailQueue.add('send-payment-pending', {
      email: booking.user.userProfile.email,
      bookingData: {
        turfName: booking.turf.name,
        amount: booking.depositAmount,
        expiryTime,
      },
    });
  }

  private async sendNoShowEmail(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: { include: { userProfile: true } },
        turf: true,
      },
    });

    if (!booking || !booking.user?.userProfile?.email) return;

    await this.emailQueue.add('send-no-show-notice', {
      email: booking.user.userProfile.email,
      bookingData: {
        turfName: booking.turf.name,
        date: booking.bookingDate.toISOString().split('T')[0],
        startTime: booking.startTime,
      },
    });
  }

  async sendTestEmail(authId: string) {
    const user = await this.prisma.auth.findUnique({
      where: { id: authId },
      include: { userProfile: true },
    });

    if (!user?.userProfile?.email) {
      throw new BadRequestException(
        'User profile must have an email address to send a test email.',
      );
    }

    await this.emailQueue.add('send-booking-confirmation', {
      email: user.userProfile.email,
      bookingData: {
        id: 'TEST-123456',
        turfName: 'Turfsy Arena (Test)',
        date: new Date().toISOString().split('T')[0],
        startTime: '18:00',
        endTime: '19:00',
        amount: 1200,
        paymentStatus: 'SUCCESS',
        pin: '1234',
      },
    });

    return {
      success: true,
      message: `Test email queued to ${user.userProfile.email}`,
    };
  }

  async approveBooking(ownerAuthId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        turf: {
          include: {
            owner: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.turf.owner.authId !== ownerAuthId) {
      throw new ForbiddenException('You do not own the turf for this booking');
    }

    if (booking.bookingStatus !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Booking is not in PENDING_APPROVAL state');
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        bookingStatus: 'CONFIRMED',
      },
    });

    // Send email confirmation
    this.sendBookingConfirmationEmail(bookingId).catch((err) =>
      this.logger.error(
        `[EMAIL] Failed to send confirmation email: ${err.message}`,
      ),
    );

    // Push notification to customer
    this.triggerPushNotification(
      booking.userId,
      'Your Booking has been Confirmed',
      'Booking Confirmed. Your QR will become available 10 minutes before your slot.',
      {
        type: 'BOOKING_CONFIRMED',
        bookingId: booking.id,
      },
    );

    // Push notification to owner
    this.triggerPushNotification(
      ownerAuthId,
      'New Booking Confirmed',
      `Booking request approved for ${booking.turf.name} at ${booking.startTime}.`,
      {
        type: 'PAYMENT_RECEIVED_OWNER',
        bookingId: booking.id,
      },
    );

    return {
      success: true,
      message: 'Booking approved successfully',
      data: updated,
    };
  }

  async rejectBooking(ownerAuthId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        turf: {
          include: {
            owner: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.turf.owner.authId !== ownerAuthId) {
      throw new ForbiddenException('You do not own the turf for this booking');
    }

    if (booking.bookingStatus !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Booking is not in PENDING_APPROVAL state');
    }

    // Reuse the refund logic: 100% refund on rejection
    let refundAmount = 0;
    let newPaymentStatus: PaymentStatus =
      booking.paymentStatus === 'PENDING' ? 'FAILED' : booking.paymentStatus;
    let razorpayRefundId: string | null = null;

    if (booking.paymentStatus === 'SUCCESS' && booking.razorpayPaymentId) {
      refundAmount = booking.depositAmount;

      if (refundAmount > 0) {
        try {
          const refund = await this.razorpay.payments.refund(
            booking.razorpayPaymentId,
            {
              amount: refundAmount * 100, // paise
              notes: {
                bookingId,
                reason: 'Booking request rejected by owner',
              },
            },
          );
          razorpayRefundId = refund.id;
          newPaymentStatus = 'REFUNDED' as PaymentStatus;
        } catch (refundError) {
          this.logger.error(
            `[REFUND FAILED] bookingId=${bookingId}`,
            refundError?.stack || refundError,
          );
          this.paymentLogger.alert('Refund API call failed', {
            bookingId,
            userId: booking.userId,
            error: String(refundError),
          });
          this.metrics.refundTotal.inc({ status: 'failed' });
          newPaymentStatus = booking.paymentStatus;
          refundAmount = 0;
        }
      }
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        bookingStatus: 'REJECTED',
        paymentStatus: newPaymentStatus,
        razorpayRefundId,
        cancelledAt: new Date(),
        cancelReason: 'Rejected by owner',
      },
    });

    // Clean up split if exists
    await this.prisma.bookingSplit.deleteMany({
      where: { bookingId },
    });

    // Release Slot Lock
    await this.releaseSlotLockForBooking(updated);

    // Secure logging
    this.paymentLogger.log({
      userId: booking.userId,
      bookingId,
      turfId: booking.turfId,
      action: refundAmount > 0 ? 'refund' : 'cancel',
      amount: refundAmount,
      razorpayOrderId: booking.razorpayOrderId || undefined,
      razorpayPaymentId: booking.razorpayPaymentId || undefined,
      result: 'SUCCESS',
    });

    // Push notification to customer
    this.triggerPushNotification(
      booking.userId,
      'Your Booking Request was Rejected. Refund has been initiated.',
      `Your booking request for ${booking.turf.name} on ${booking.bookingDate.toISOString().split('T')[0]} at ${booking.startTime} was rejected. Refund has been initiated.`,
      {
        type: 'BOOKING_REJECTED',
        bookingId: booking.id,
      },
    );

    return {
      success: true,
      message: 'Booking rejected successfully',
      data: updated,
    };
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
        .catch((err) => {
          this.logger.error(`[PUSH_ERROR] ${err.message}`);
        });
    } catch (error) {
      this.logger.error(`[NOTIFICATION_TRIGGER_ERROR] ${error.message}`);
    }
  }
}
