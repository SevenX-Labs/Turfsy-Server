import { Test, TestingModule } from '@nestjs/testing';
import { UserBookingSplitwiseService } from './user-booking-splitwise.service';

import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/services/cache.service';
import { RateLimiterService } from '../../common/services/rate-limiter.service';
import { PaymentLoggerService } from '../../common/services/payment-logger.service';
import { NotificationsService } from '../../common/notifications/notifications.service';

describe('UserBookingSplitwiseService', () => {
  let mockPrisma: any;
  let mockNotifications: any;
  let mockRateLimiter: any;
  let mockCache: any;
  let mockPaymentLogger: any;

  beforeEach(async () => {
    mockPrisma = {
      booking: {
        findUnique: jest.fn(),
      },
      bookingSplit: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      bookingSplitPlayer: {
        create: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      userProfile: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      turf: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    mockNotifications = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };

    mockRateLimiter = {
      check: jest.fn().mockResolvedValue(undefined),
    };

    mockCache = {
      getOrSet: jest.fn(),
      invalidate: jest.fn().mockResolvedValue(undefined),
    };

    mockPaymentLogger = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserBookingSplitwiseService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: CacheService,
          useValue: mockCache,
        },
        {
          provide: RateLimiterService,
          useValue: mockRateLimiter,
        },
        {
          provide: PaymentLoggerService,
          useValue: mockPaymentLogger,
        },
        {
          provide: NotificationsService,
          useValue: mockNotifications,
        },
      ],
    }).compile();

    service = module.get<UserBookingSplitwiseService>(
      UserBookingSplitwiseService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addPlayers push notifications', () => {
    it('should send notification to new registered teammates with lead and turf names', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        id: 'booking-1',
        userId: 'lead-auth-id',
        turfId: 'turf-1',
        amount: 1000,
        bookingDate: new Date('2026-08-20T10:00:00Z'),
      });

      mockPrisma.userProfile.findUnique.mockImplementation(({ where }: any) => {
        if (where.authId === 'lead-auth-id') {
          return Promise.resolve({ name: 'Alex Hunter', username: 'alex' });
        }
        return Promise.resolve(null);
      });

      mockPrisma.bookingSplit.findUnique.mockResolvedValue({
        id: 'split-1',
        bookingId: 'booking-1',
        leadUserId: 'lead-auth-id',
        totalAmount: 1000,
        isSplitDone: false,
        players: [
          {
            id: 'p-1',
            splitId: 'split-1',
            username: 'alex',
            userId: 'lead-auth-id',
            amount: 1000,
            status: 'PENDING',
          },
        ],
      });

      mockPrisma.userProfile.findMany.mockResolvedValue([
        { username: 'marcus', authId: 'teammate-auth-id' },
      ]);

      mockPrisma.bookingSplitPlayer.findMany.mockResolvedValue([
        {
          id: 'p-2',
          splitId: 'split-1',
          username: 'marcus',
          userId: 'teammate-auth-id',
          amount: 500,
          status: 'PENDING',
        },
      ]);

      mockPrisma.turf.findUnique.mockResolvedValue({
        id: 'turf-1',
        name: 'Thunder Turf',
      });

      const result = await service.addPlayers(
        'lead-auth-id',
        'booking-1',
        { usernames: ['marcus'] },
        '127.0.0.1',
      );

      expect(result.success).toBe(true);
      expect(mockNotifications.sendNotification).toHaveBeenCalledWith(
        'teammate-auth-id',
        'Added to Split 👥',
        'You were added to a split for Thunder Turf by Alex Hunter',
        {
          type: 'SPLIT_ADDED',
          bookingId: 'booking-1',
        },
      );
    });
  });

  describe('triggerSplit push notifications', () => {
    it('should send payment required notifications to all players with amount > 0', async () => {
      mockPrisma.booking.findUnique.mockResolvedValue({
        id: 'booking-1',
        userId: 'lead-auth-id',
        turfId: 'turf-1',
        amount: 1000,
      });

      mockPrisma.userProfile.findUnique.mockImplementation(({ where }: any) => {
        if (where.authId === 'lead-auth-id') {
          return Promise.resolve({ name: 'Alex Hunter', username: 'alex' });
        }
        return Promise.resolve(null);
      });

      mockPrisma.bookingSplit.findUnique.mockResolvedValue({
        id: 'split-1',
        bookingId: 'booking-1',
        leadUserId: 'lead-auth-id',
        totalAmount: 1000,
        isSplitDone: false,
        players: [
          {
            id: 'p-1',
            splitId: 'split-1',
            username: 'alex',
            userId: 'lead-auth-id',
            amount: 500,
            status: 'PENDING',
          },
          {
            id: 'p-2',
            splitId: 'split-1',
            username: 'marcus',
            userId: 'teammate-auth-id',
            amount: 500,
            status: 'PENDING',
          },
        ],
      });

      mockPrisma.bookingSplit.update.mockResolvedValue({
        id: 'split-1',
        bookingId: 'booking-1',
        leadUserId: 'lead-auth-id',
        totalAmount: 1000,
        isSplitDone: true,
        players: [
          {
            id: 'p-1',
            splitId: 'split-1',
            username: 'alex',
            userId: 'lead-auth-id',
            amount: 500,
            status: 'PENDING',
          },
          {
            id: 'p-2',
            splitId: 'split-1',
            username: 'marcus',
            userId: 'teammate-auth-id',
            amount: 500,
            status: 'PENDING',
          },
        ],
      });

      mockPrisma.turf.findUnique.mockResolvedValue({
        id: 'turf-1',
        name: 'Thunder Turf',
      });

      const result = await service.triggerSplit(
        'lead-auth-id',
        'booking-1',
        '127.0.0.1',
      );

      expect(result.success).toBe(true);
      expect(mockNotifications.sendNotification).toHaveBeenCalledWith(
        'teammate-auth-id',
        'Payment Required 💸',
        'You need to pay ₹500 to Alex Hunter for Thunder Turf. See details.',
        {
          type: 'SPLIT_PAYMENT',
          bookingId: 'booking-1',
          amount: 500,
        },
      );
    });
  });
});
