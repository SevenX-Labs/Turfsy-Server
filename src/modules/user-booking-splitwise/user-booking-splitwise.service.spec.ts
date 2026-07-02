import { Test, TestingModule } from '@nestjs/testing';
import { UserBookingSplitwiseService } from './user-booking-splitwise.service';

import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/services/cache.service';
import { RateLimiterService } from '../../common/services/rate-limiter.service';
import { PaymentLoggerService } from '../../common/services/payment-logger.service';
import { NotificationsService } from '../../common/notifications/notifications.service';

describe('UserBookingSplitwiseService', () => {
  let service: UserBookingSplitwiseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserBookingSplitwiseService,
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: RateLimiterService,
          useValue: {
            isRateLimited: jest.fn(),
          },
        },
        {
          provide: PaymentLoggerService,
          useValue: {
            logPayment: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            sendNotification: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserBookingSplitwiseService>(UserBookingSplitwiseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
