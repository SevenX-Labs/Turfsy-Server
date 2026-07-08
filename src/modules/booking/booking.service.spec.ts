import { Test, TestingModule } from '@nestjs/testing';
import { BookingService } from './booking.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { PaymentLoggerService } from '../../common/services/payment-logger.service';
import { RateLimiterService } from '../../common/services/rate-limiter.service';
import { UserGamificationService } from '../user-gamification/user-gamification.service';
import { EmailService } from '../../common/email/email.service';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { RedisService } from '../../common/redis/redis.service';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PaymentType, TurfPaymentPreference } from '@prisma/client';
import * as crypto from 'crypto';

describe('BookingService - Platform Fee Slabs', () => {
  let service: BookingService;
  let prisma: PrismaService;

  const mockQueue = {
    add: jest.fn(),
  };

  const mockPrisma = {
    turf: {
      findUnique: jest.fn(),
    },
    platformFeeSlab: {
      findMany: jest.fn(),
    },
    slotLock: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    booking: {
      create: jest.fn(),
    },
    turfMaintenance: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrisma)),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  };

  const mockConfigService = {
    get: jest.fn((key) => {
      if (key === 'RAZORPAY_KEY_ID') return 'rzp_test_mock_key_id_123';
      if (key === 'RAZORPAY_KEY_SECRET') return 'mock_test_key_secret_123';
      if (key === 'RAZORPAY_WEBHOOK_SECRET') return 'mock_webhook_secret_123';
      if (key === 'QR_SECRET_KEY') return 'test-qr-secret-key';
      return null;
    }),
  };

  const mockPaymentLogger = {
    log: jest.fn(),
    alert: jest.fn(),
  };

  const mockRateLimiter = {
    check: jest.fn().mockResolvedValue(true),
  };

  const mockUserGamification = {
    incrementBookings: jest.fn(),
    handleNoShow: jest.fn().mockResolvedValue({}),
    handleBookingCompletion: jest.fn().mockResolvedValue({}),
  };

  const mockEmailService = {
    sendBookingConfirmation: jest.fn(),
  };

  const mockNotifications = {
    sendPush: jest.fn(),
    sendNotification: jest.fn().mockResolvedValue(true),
  };

  const mockMetrics = {
    prismaQueryTotal: { inc: jest.fn() },
    prismaQueryDuration: { observe: jest.fn() },
    bookingCreatedTotal: { inc: jest.fn() },
    paymentInitiatedTotal: { inc: jest.fn() },
    paymentFailedTotal: { inc: jest.fn() },
    paymentVerifiedTotal: { inc: jest.fn() },
    webhookReceivedTotal: { inc: jest.fn() },
    refundTotal: { inc: jest.fn() },
    bookingCancelledTotal: { inc: jest.fn() },
  };

  const mockRedis = {
    acquireLock: jest.fn().mockResolvedValue('lock-token'),
    releaseLock: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PaymentLoggerService, useValue: mockPaymentLogger },
        { provide: RateLimiterService, useValue: mockRateLimiter },
        { provide: UserGamificationService, useValue: mockUserGamification },
        { provide: EmailService, useValue: mockEmailService },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: MetricsService, useValue: mockMetrics },
        { provide: RedisService, useValue: mockRedis },
        { provide: getQueueToken('email'), useValue: mockQueue },
        { provide: getQueueToken('payment-retry'), useValue: mockQueue },
        { provide: getQueueToken('booking-expiry'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should fail fast if QR_SECRET_KEY is missing', () => {
    const originalGet = mockConfigService.get;
    mockConfigService.get = jest.fn((key) => {
      if (key === 'QR_SECRET_KEY') return null;
      return originalGet(key);
    });

    expect(() => {
      new BookingService(
        prisma,
        mockConfigService as any,
        mockPaymentLogger as any,
        mockRateLimiter as any,
        mockUserGamification as any,
        mockEmailService as any,
        mockNotifications as any,
        mockMetrics as any,
        mockRedis as any,
        mockQueue as any,
        mockQueue as any,
        mockQueue as any,
      );
    }).toThrow('FATAL: QR_SECRET_KEY must be set to a real secret value in environment variables.');

    // Restore
    mockConfigService.get = originalGet;
  });

  describe('createBooking - Platform Fee Slabs & Payment Preferences', () => {
    const dummyTurf = {
      id: 'turf-1',
      name: 'Airoli Kickoff Turf',
      status: 'ACTIVE',
      paymentPreferences: ['FULL_ONLINE', 'ADVANCE_PAYMENT', 'FULL_CASH'],
      paymentPreference: TurfPaymentPreference.FULL_ONLINE,
      minSlotDurationMins: 60,
      weekdayDayPrice: 1000,
      weekdayNightPrice: 1000,
      weekendDayPrice: 1000,
      weekendNightPrice: 1000,
      openTime: '06:00',
      closeTime: '23:00',
      owner: { authId: 'owner-auth-id' },
    };

    const defaultSlabs = [
      { minAmount: 0, maxAmount: 1000, platformFee: 50, isActive: true },
      { minAmount: 1001, maxAmount: 2000, platformFee: 100, isActive: true },
      { minAmount: 2001, maxAmount: 3000, platformFee: 150, isActive: true },
      { minAmount: 3001, maxAmount: 4000, platformFee: 200, isActive: true },
      { minAmount: 4001, maxAmount: 5000, platformFee: 250, isActive: true },
    ];

    const createDto = {
      turfId: 'turf-1',
      bookingDate: '2026-07-10',
      startTime: '10:00',
      endTime: '11:00',
      durationMins: 60,
      paymentType: PaymentType.FULL_ONLINE,
      notes: 'No notes',
    };

    beforeEach(() => {
      mockPrisma.turf.findUnique.mockResolvedValue(dummyTurf);
      mockPrisma.platformFeeSlab.findMany.mockResolvedValue(defaultSlabs);
      mockPrisma.slotLock.create.mockResolvedValue({ id: 'lock-id' });
      mockPrisma.slotLock.findFirst.mockResolvedValue(null);
      mockPrisma.slotLock.update.mockResolvedValue({ id: 'lock-id' });
      mockPrisma.booking.create.mockResolvedValue({
        id: 'booking-id',
        bookingDate: '2026-07-10',
        startTime: '10:00',
        endTime: '11:00',
        paymentType: PaymentType.FULL_ONLINE,
        amount: 1050,
        groundCharge: 1000,
        platformFee: 50,
        depositAmount: 1050,
      });
    });

    it('should successfully calculate a ₹50 platform fee for Ground Charge of ₹1000 (Boundary Value - slab 1)', async () => {
      const response = await service.createBooking('user-id', createDto);
      expect(response.success).toBe(true);
      expect(response.data.groundCharge).toBe(1000);
      expect(response.data.platformFee).toBe(50);
      expect(response.data.totalAmount).toBe(1050);
      expect(response.data.onlinePayable).toBe(1050);
      expect(response.data.remainingAtTurf).toBe(0);
    });

    it('should successfully calculate a ₹100 platform fee for Ground Charge of ₹1200 (Boundary Value - slab 2)', async () => {
      mockPrisma.booking.create.mockResolvedValue({
        id: 'booking-id',
        amount: 1300,
        groundCharge: 1200,
        platformFee: 100,
        depositAmount: 1300,
      });

      // We make it a 72-minute slot or change turf price to mock custom calculation
      jest.spyOn(service as any, 'calculatePrice').mockReturnValue(1200);

      const response = await service.createBooking('user-id', createDto);
      expect(response.data.groundCharge).toBe(1200);
      expect(response.data.platformFee).toBe(100);
      expect(response.data.totalAmount).toBe(1300);
    });

    it('should calculate correct amounts for ADVANCE_PAYMENT preference (30% deposit)', async () => {
      const advanceTurf = { ...dummyTurf, paymentPreference: TurfPaymentPreference.ADVANCE_PAYMENT };
      mockPrisma.turf.findUnique.mockResolvedValue(advanceTurf);
      jest.spyOn(service as any, 'calculatePrice').mockReturnValue(1200);

      const response = await service.createBooking('user-id', {
        ...createDto,
        paymentType: PaymentType.HALF_ONLINE_HALF_CASH,
      });

      // Ground Charge = 1200, Platform Fee = 100
      // Ground Advance = 1200 * 0.3 = 360
      // Online Payable = 360 + 100 = 460
      // Remaining at turf = 1200 - 360 = 840
      expect(response.data.groundCharge).toBe(1200);
      expect(response.data.platformFee).toBe(100);
      expect(response.data.advanceAmount).toBe(360);
      expect(response.data.onlinePayable).toBe(460);
      expect(response.data.remainingAtTurf).toBe(840);
    });

    it('should calculate correct amounts for FULL_CASH preference', async () => {
      const cashTurf = { ...dummyTurf, paymentPreference: TurfPaymentPreference.FULL_CASH };
      mockPrisma.turf.findUnique.mockResolvedValue(cashTurf);
      jest.spyOn(service as any, 'calculatePrice').mockReturnValue(1200);

      const response = await service.createBooking('user-id', {
        ...createDto,
        paymentType: PaymentType.FULL_CASH,
      });

      // Ground Charge = 1200, Platform Fee = 100
      // Online Payable = 100 (platformFee only)
      // Remaining at turf = 1200 (ground charge)
      expect(response.data.groundCharge).toBe(1200);
      expect(response.data.platformFee).toBe(100);
      expect(response.data.advanceAmount).toBe(0);
      expect(response.data.onlinePayable).toBe(100);
      expect(response.data.remainingAtTurf).toBe(1200);
    });

    it('should throw BadRequestException if no active slab matches the ground charge', async () => {
      mockPrisma.platformFeeSlab.findMany.mockResolvedValue([]);
      await expect(service.createBooking('user-id', createDto)).rejects.toThrow(
        new BadRequestException('No slab exists for this booking amount'),
      );
    });

    it('should throw BadRequestException if multiple active slabs overlap/match', async () => {
      mockPrisma.platformFeeSlab.findMany.mockResolvedValue([
        { minAmount: 0, maxAmount: 1000, platformFee: 50, isActive: true },
        { minAmount: 500, maxAmount: 1500, platformFee: 100, isActive: true },
      ]);
      await expect(service.createBooking('user-id', createDto)).rejects.toThrow(
        new BadRequestException('Slab ranges overlap'),
      );
    });

    it('should throw BadRequestException if any slab has minAmount > maxAmount', async () => {
      mockPrisma.platformFeeSlab.findMany.mockResolvedValue([
        { minAmount: 2000, maxAmount: 1000, platformFee: 50, isActive: true },
      ]);
      await expect(service.createBooking('user-id', createDto)).rejects.toThrow(
        new BadRequestException('minAmount cannot be greater than maxAmount'),
      );
    });

    it('should throw BadRequestException if any slab has a negative platformFee', async () => {
      mockPrisma.platformFeeSlab.findMany.mockResolvedValue([
        { minAmount: 0, maxAmount: 1000, platformFee: -50, isActive: true },
      ]);
      await expect(service.createBooking('user-id', createDto)).rejects.toThrow(
        new BadRequestException('Platform Fee cannot be negative'),
      );
    });
  });

  describe('createBooking - 90-Day Booking Window Validation', () => {
    const dummyTurf = {
      id: 'turf-1',
      name: 'Airoli Kickoff Turf',
      status: 'ACTIVE',
      paymentPreferences: ['FULL_ONLINE', 'ADVANCE_PAYMENT', 'FULL_CASH'],
      paymentPreference: TurfPaymentPreference.FULL_ONLINE,
      minSlotDurationMins: 60,
      weekdayDayPrice: 1000,
      weekdayNightPrice: 1000,
      weekendDayPrice: 1000,
      weekendNightPrice: 1000,
      openTime: '06:00',
      closeTime: '23:00',
      owner: { authId: 'owner-auth-id' },
    };

    const defaultSlabs = [
      { minAmount: 0, maxAmount: 1000, platformFee: 50, isActive: true },
    ];

    beforeEach(() => {
      mockPrisma.turf.findUnique.mockResolvedValue(dummyTurf);
      mockPrisma.platformFeeSlab.findMany.mockResolvedValue(defaultSlabs);
      mockPrisma.slotLock.create.mockResolvedValue({ id: 'lock-id' });
      mockPrisma.slotLock.findFirst.mockResolvedValue(null);
      mockPrisma.slotLock.update.mockResolvedValue({ id: 'lock-id' });
    });

    it('should throw BadRequestException if the booking date is beyond 90 days from today', async () => {
      const farDate = new Date();
      farDate.setDate(farDate.getDate() + 95);
      const bookingDateStr = farDate.toISOString().split('T')[0];

      await expect(
        service.createBooking('user-id', {
          turfId: 'turf-1',
          bookingDate: bookingDateStr,
          startTime: '10:00',
          endTime: '11:00',
          durationMins: 60,
          paymentType: PaymentType.FULL_ONLINE,
        }),
      ).rejects.toThrow(
        new BadRequestException('Cannot book slots beyond the 90-day window'),
      );
    });

    it('should allow booking within the 90-day window', async () => {
      const allowedDate = new Date();
      allowedDate.setDate(allowedDate.getDate() + 45);
      const bookingDateStr = allowedDate.toISOString().split('T')[0];

      mockPrisma.booking.create.mockResolvedValue({
        id: 'booking-id',
        bookingDate: bookingDateStr,
        startTime: '10:00',
        endTime: '11:00',
        paymentType: PaymentType.FULL_ONLINE,
        amount: 1050,
        groundCharge: 1000,
        platformFee: 50,
        depositAmount: 1050,
      });

      const response = await service.createBooking('user-id', {
        turfId: 'turf-1',
        bookingDate: bookingDateStr,
        startTime: '10:00',
        endTime: '11:00',
        durationMins: 60,
        paymentType: PaymentType.FULL_ONLINE,
      });

      expect(response.success).toBe(true);
    });
  });

  describe('Manual Approval vs Instant Flow & Owner Action APIs', () => {
    let mockBooking: any;

    beforeEach(() => {
      mockBooking = {
        id: 'booking-uuid',
        userId: 'user-id',
        turfId: 'turf-1',
        bookingDate: new Date(),
        startTime: '10:00',
        endTime: '11:00',
        bookingStatus: 'PENDING_APPROVAL',
        paymentStatus: 'SUCCESS',
        paymentType: 'FULL_ONLINE',
        depositAmount: 1000,
        razorpayPaymentId: 'pay_123',
        turf: {
          id: 'turf-1',
          name: 'Airoli Kickoff Turf',
          bookingApprovalType: 'MANUAL',
          owner: {
            authId: 'owner-auth-id',
          },
        },
      };

      // Mock Prisma methods
      mockPrisma.booking = {
        ...mockPrisma.booking,
        findUnique: jest.fn().mockResolvedValue(mockBooking),
        update: jest.fn().mockImplementation(({ data }) => ({
          ...mockBooking,
          ...data,
        })),
        deleteMany: jest.fn(),
      };
      // We also mock bookingSplit
      (mockPrisma as any).bookingSplit = {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      };
    });

    it('should successfully approve a PENDING_APPROVAL booking', async () => {
      const response = await service.approveBooking('owner-auth-id', 'booking-uuid');
      expect(response.success).toBe(true);
      expect(response.data.bookingStatus).toBe('CONFIRMED');
    });

    it('should throw ForbiddenException if ownerAuthId does not match turf owner', async () => {
      await expect(
        service.approveBooking('wrong-owner', 'booking-uuid'),
      ).rejects.toThrow();
    });

    it('should reject a PENDING_APPROVAL booking and trigger refund', async () => {
      // Mock the Razorpay refund API call on the service instance
      (service as any).razorpay = {
        payments: {
          refund: jest.fn().mockResolvedValue({ id: 'rfnd_test_123' }),
        },
        orders: { create: jest.fn(), fetch: jest.fn() },
      };

      const response = await service.rejectBooking('owner-auth-id', 'booking-uuid');
      expect(response.success).toBe(true);
      expect(response.data.bookingStatus).toBe('REJECTED');
      expect(response.data.paymentStatus).toBe('REFUNDED');
    });
  });

  describe('createBooking & getBookedSlots under Maintenance Blocks', () => {
    const dummyTurf = {
      id: 'turf-1',
      name: 'Airoli Kickoff Turf',
      status: 'ACTIVE',
      paymentPreferences: ['FULL_ONLINE', 'ADVANCE_PAYMENT', 'FULL_CASH'],
      paymentPreference: TurfPaymentPreference.FULL_ONLINE,
      minSlotDurationMins: 60,
      weekdayDayPrice: 1000,
      weekdayNightPrice: 1000,
      weekendDayPrice: 1000,
      weekendNightPrice: 1000,
      openTime: '06:00',
      closeTime: '23:00',
      owner: { authId: 'owner-auth-id' },
    };

    const defaultSlabs = [
      { minAmount: 0, maxAmount: 1000, platformFee: 50, isActive: true },
    ];

    beforeEach(() => {
      mockPrisma.turf.findUnique.mockResolvedValue(dummyTurf);
      mockPrisma.platformFeeSlab.findMany.mockResolvedValue(defaultSlabs);
      mockPrisma.slotLock.create.mockResolvedValue({ id: 'lock-id' });
      mockPrisma.slotLock.findFirst.mockResolvedValue(null);
      mockPrisma.slotLock.update.mockResolvedValue({ id: 'lock-id' });
    });

    it('Booking During Maintenance - should reject booking request with BadRequestException', async () => {
      mockPrisma.turfMaintenance.findFirst.mockResolvedValue({
        id: 'm-1',
        reason: 'Ground Renovation',
      });

      await expect(
        service.createBooking('user-id', {
          turfId: 'turf-1',
          bookingDate: '2026-08-15',
          startTime: '10:00',
          endTime: '11:00',
          durationMins: 60,
          paymentType: PaymentType.FULL_ONLINE,
        }),
      ).rejects.toThrow(
        new BadRequestException('Turf is unavailable due to maintenance.'),
      );
    });

    it('Booking Outside Maintenance - should allow booking request to proceed', async () => {
      mockPrisma.turfMaintenance.findFirst.mockResolvedValue(null);
      mockPrisma.booking.create.mockResolvedValue({
        id: 'booking-id',
        bookingDate: '2026-08-15',
        startTime: '10:00',
        endTime: '11:00',
        paymentType: PaymentType.FULL_ONLINE,
        amount: 1050,
        groundCharge: 1000,
        platformFee: 50,
        depositAmount: 1050,
      });

      const response = await service.createBooking('user-id', {
        turfId: 'turf-1',
        bookingDate: '2026-08-15',
        startTime: '10:00',
        endTime: '11:00',
        durationMins: 60,
        paymentType: PaymentType.FULL_ONLINE,
      });

      expect(response.success).toBe(true);
    });

    it('Availability API - should hide maintenance dates by marking the day as booked/expired', async () => {
      mockPrisma.turfMaintenance.findFirst.mockResolvedValue({
        id: 'm-1',
        reason: 'Ground Renovation',
      });

      const result = await service.getBookedSlots('turf-1', '2026-08-15');
      expect(result.success).toBe(true);
      expect(result.data.underMaintenance).toBe(true);
      expect(result.data.maintenanceReason).toBe('Ground Renovation');
      expect(result.data.bookedSlots[0]).toEqual({
        startTime: '06:00',
        endTime: '23:00',
        isExpired: true,
      });
    });
  });

  describe('QR Check-in Flow & Verification', () => {
    const dummyBooking = {
      id: 'booking-id-123',
      userId: 'customer-123',
      bookingStatus: 'CONFIRMED',
      startTime: '10:00',
      endTime: '11:00',
      bookingDate: new Date(),
      turfId: 'turf-1',
      turf: {
        name: 'Turf Alpha',
        owner: { authId: 'owner-auth-id' },
      },
    };

    const secret = 'test-qr-secret-key';

    const generateTestQrData = (payloadOverrides = {}) => {
      const payload = {
        bookingId: 'booking-id-123',
        customerId: 'customer-123',
        bookingReference: 'BK-123',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        randomNonce: 'nonce-123',
        ...payloadOverrides,
      };
      const payloadString = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex');

      return JSON.stringify({ payload, signature });
    };

    beforeEach(() => {
      mockPrisma.booking.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      // mock update for no-show cron
      mockPrisma.booking.update = jest.fn().mockResolvedValue({});
    });

    it('QR Generation - should successfully generate a base64 QR code image', async () => {
      const windowEnd = new Date(Date.now() + 600000);
      const qrCode = await service.generateCheckInQrCode(dummyBooking, windowEnd);
      expect(qrCode).toContain('data:image/png;base64,');
    });

    it('Successful check-in - should verify a valid QR and complete the booking', async () => {
      jest.useFakeTimers({ legacyFakeTimers: false });
      const now = new Date('2026-07-03T04:25:00.000Z'); // 09:55 AM IST
      jest.setSystemTime(now);

      const qrData = generateTestQrData({
        expiresAt: new Date('2026-07-03T05:40:00.000Z').toISOString(), // 11:10 AM IST
      });
      mockPrisma.booking.findUnique = jest.fn().mockResolvedValue({
        ...dummyBooking,
        bookingDate: new Date('2026-07-03T00:00:00.000Z'),
      });

      const result = await service.verifyCheckInQr('owner-auth-id', qrData, '127.0.0.1');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Check-in successful');
      expect(mockPrisma.booking.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'booking-id-123', bookingStatus: 'CONFIRMED' },
          data: expect.objectContaining({
            bookingStatus: 'COMPLETED',
            checkedInByOwnerId: 'owner-auth-id',
            scanIpAddress: '127.0.0.1'
          })
        }),
      );
    });

    it('Expired QR - should reject expired QR codes', async () => {
      const qrData = generateTestQrData({
        expiresAt: new Date(Date.now() - 1000).toISOString(), // expired 1s ago
      });

      await expect(
        service.verifyCheckInQr('owner-auth-id', qrData),
      ).rejects.toThrow(BadRequestException);
    });

    it('Invalid/Modified QR - should reject if signature is modified or tampered', async () => {
      const qrDataRaw = JSON.parse(generateTestQrData());
      qrDataRaw.payload.bookingId = 'different-booking-id'; // modify
      const tamperedQrData = JSON.stringify(qrDataRaw);

      await expect(
        service.verifyCheckInQr('owner-auth-id', tamperedQrData),
      ).rejects.toThrow(BadRequestException);
    });

    it('Wrong Turf - should reject if booking belongs to a different owner/turf', async () => {
      const qrData = generateTestQrData();
      mockPrisma.booking.findUnique = jest.fn().mockResolvedValue(dummyBooking);

      await expect(
        service.verifyCheckInQr('wrong-owner-id', qrData),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Outside time window - should reject if booking is outside the check-in window', async () => {
      jest.useFakeTimers({ legacyFakeTimers: false });
      const now = new Date('2026-07-03T00:30:00.000Z'); // 06:00 AM IST
      jest.setSystemTime(now);

      const qrData = generateTestQrData({
        expiresAt: new Date('2026-07-03T05:40:00.000Z').toISOString(), // 11:10 AM IST
      });
      mockPrisma.booking.findUnique = jest.fn().mockResolvedValue({
        ...dummyBooking,
        bookingDate: new Date('2026-07-03T00:00:00.000Z'),
      });

      await expect(
        service.verifyCheckInQr('owner-auth-id', qrData),
      ).rejects.toThrow(BadRequestException);
    });

    it('Duplicate scan - should reject with 409 Conflict for completed bookings', async () => {
      const qrData = generateTestQrData();
      mockPrisma.booking.findUnique = jest.fn().mockResolvedValue({
        ...dummyBooking,
        bookingStatus: 'COMPLETED',
      });

      await expect(
        service.verifyCheckInQr('owner-auth-id', qrData),
      ).rejects.toThrow(ConflictException);
    });

    it('Automatic No Show - markNoShows should transition confirmed bookings after slot end + 20 mins', async () => {
      jest.useFakeTimers({ legacyFakeTimers: false });
      const now = new Date('2026-07-03T05:55:00.000Z'); // 11:25 AM IST (ended at 11:00 AM IST, no-show threshold was 11:20 AM IST)
      jest.setSystemTime(now);

      mockPrisma.booking.findMany = jest.fn().mockResolvedValue([
        {
          id: 'b-no-show',
          userId: 'user-1',
          bookingStatus: 'CONFIRMED',
          startTime: '10:00',
          endTime: '11:00',
          bookingDate: new Date('2026-07-03T00:00:00.000Z'),
          turf: {
            name: 'Turf Alpha',
            owner: { authId: 'owner-auth-id' },
          },
        },
      ]);

      const result = await service.markNoShows();
      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(mockPrisma.booking.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'b-no-show' },
          data: { bookingStatus: 'NO_SHOW' },
        }),
      );
    });
  });
});
