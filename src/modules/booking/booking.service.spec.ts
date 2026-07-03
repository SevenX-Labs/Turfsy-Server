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
import { BadRequestException } from '@nestjs/common';
import { PaymentType, TurfPaymentPreference } from '@prisma/client';

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
    $transaction: jest.fn((cb) => cb(mockPrisma)),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  };

  const mockConfigService = {
    get: jest.fn((key) => {
      if (key === 'RAZORPAY_KEY_ID') return 'key_id';
      if (key === 'RAZORPAY_KEY_SECRET') return 'your_razorpay_key_secret';
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
  };

  const mockEmailService = {
    sendBookingConfirmation: jest.fn(),
  };

  const mockNotifications = {
    sendPush: jest.fn(),
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

  describe('createBooking - Platform Fee Slabs & Payment Preferences', () => {
    const dummyTurf = {
      id: 'turf-1',
      name: 'Airoli Kickoff Turf',
      status: 'ACTIVE',
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
      const response = await service.rejectBooking('owner-auth-id', 'booking-uuid');
      expect(response.success).toBe(true);
      expect(response.data.bookingStatus).toBe('REJECTED');
      expect(response.data.paymentStatus).toBe('REFUNDED');
    });
  });
});
