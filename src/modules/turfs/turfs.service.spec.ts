import { Test, TestingModule } from '@nestjs/testing';
import { TurfsService } from './turfs.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/services/cache.service';
import { TurfPaymentPreference, SportsType } from '@prisma/client';

const mockPrisma = {
  ownerProfile: { findUnique: jest.fn() },
  turf: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findFirstOrThrow: jest.fn(),
  },
};

describe('TurfsService', () => {
  let service: TurfsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TurfsService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            invalidate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TurfsService>(TurfsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTurf', () => {
    it('should successfully create a turf with single payment preference', async () => {
      mockPrisma.ownerProfile.findUnique.mockResolvedValue({
        id: 'owner-id',
        name: 'Owner Name',
      });
      mockPrisma.turf.findFirst.mockResolvedValue(null);
      mockPrisma.turf.create.mockResolvedValue({
        id: 'turf-id',
        name: 'Turf A',
        paymentPreference: TurfPaymentPreference.ADVANCE_PAYMENT,
      });

      const result = await service.createTurf('owner-auth-id', {
        name: 'Turf A',
        sportsType: SportsType.FOOTBALL,
        turfSize: '7v7',
        address: 'Thane, Mumbai',
        city: 'Mumbai',
        pincode: '400601',
        lat: 19.2,
        lng: 72.9,
        openTime: '06:00',
        closeTime: '23:00',
        minSlotDurationMins: 60,
        weekdayDayPrice: 1000,
        weekdayNightPrice: 1500,
        weekendDayPrice: 1200,
        weekendNightPrice: 1800,
        paymentPreference: TurfPaymentPreference.ADVANCE_PAYMENT,
      });

      expect(result.success).toBe(true);
      expect(result.data.paymentPreference).toBe(TurfPaymentPreference.ADVANCE_PAYMENT);
      expect(mockPrisma.turf.create).toHaveBeenCalled();
    });
  });

  describe('updateTurf', () => {
    it('should successfully update a turf with payment preference', async () => {
      mockPrisma.ownerProfile.findUnique.mockResolvedValue({
        id: 'owner-id',
      });
      mockPrisma.turf.findUnique.mockResolvedValue({
        id: 'turf-id',
        ownerProfileId: 'owner-id',
      });
      mockPrisma.turf.update.mockResolvedValue({
        id: 'turf-id',
        paymentPreference: TurfPaymentPreference.FULL_CASH,
      });

      const result = await service.updateTurf('owner-auth-id', 'turf-id', {
        paymentPreference: TurfPaymentPreference.FULL_CASH,
      });

      expect(result.success).toBe(true);
      expect(result.data.paymentPreference).toBe(TurfPaymentPreference.FULL_CASH);
      expect(mockPrisma.turf.update).toHaveBeenCalled();
    });
  });
});
