import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { OwnerCrmService, ALL_MY_TURFS } from './owner-crm.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { BookingStatus } from '@prisma/client';

describe('OwnerCrmService', () => {
  let service: OwnerCrmService;
  let prisma: any;
  let notificationsService: any;
  let mockQueue: any;

  const mockOwnerProfile = {
    id: 'owner-prof-1',
    authId: 'auth-owner-1',
    name: 'Turf Owner John',
    turfs: [
      { id: 'turf-1', name: 'Turf Arena A', ownerProfileId: 'owner-prof-1' },
      { id: 'turf-2', name: 'Turf Arena B', ownerProfileId: 'owner-prof-1' },
    ],
  };

  beforeEach(async () => {
    prisma = {
      ownerProfile: {
        findUnique: jest.fn(),
      },
      turf: {
        findUnique: jest.fn(),
      },
      booking: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      userSettings: {
        findMany: jest.fn(),
      },
      auth: {
        findMany: jest.fn(),
      },
      notificationLog: {
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
    };

    notificationsService = {
      sendMulticastNotification: jest.fn().mockResolvedValue(true),
      sendNotification: jest.fn().mockResolvedValue(true),
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerCrmService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: getQueueToken('notification'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<OwnerCrmService>(OwnerCrmService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateAndResolveTurfs', () => {
    it('throws NotFoundException if owner profile does not exist', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.validateAndResolveTurfs('unknown-auth', 'turf-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if owner has no registered turfs', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue({
        id: 'owner-empty',
        authId: 'auth-owner-empty',
        turfs: [],
      });

      await expect(
        service.validateAndResolveTurfs('auth-owner-empty', 'turf-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('resolves all turfs when ALL_MY_TURFS is requested', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(mockOwnerProfile);

      const result = await service.validateAndResolveTurfs(
        'auth-owner-1',
        ALL_MY_TURFS,
      );
      expect(result.targetTurfs).toHaveLength(2);
      expect(result.targetTurfIds).toEqual(['turf-1', 'turf-2']);
    });

    it('resolves a specific turf owned by this owner', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(mockOwnerProfile);

      const result = await service.validateAndResolveTurfs(
        'auth-owner-1',
        'turf-1',
      );
      expect(result.targetTurfs).toHaveLength(1);
      expect(result.targetTurfIds).toEqual(['turf-1']);
    });

    it('throws ForbiddenException if turf exists but belongs to another owner', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(mockOwnerProfile);
      prisma.turf.findUnique.mockResolvedValue({
        id: 'turf-alien',
        ownerProfileId: 'other-owner-id',
      });

      await expect(
        service.validateAndResolveTurfs('auth-owner-1', 'turf-alien'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if requested turf does not exist anywhere', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(mockOwnerProfile);
      prisma.turf.findUnique.mockResolvedValue(null);

      await expect(
        service.validateAndResolveTurfs('auth-owner-1', 'turf-nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getEligibleCustomerIds', () => {
    it('returns eligible customers and filters out those with offerAlerts or notifications disabled', async () => {
      // 3 users booked
      prisma.booking.findMany.mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-2' },
        { userId: 'user-3' },
      ]);

      // user-2 disabled offer alerts
      prisma.userSettings.findMany.mockResolvedValue([
        { authId: 'user-2', offerAlerts: false },
      ]);

      // user-1 and user-3 are active and not banned
      prisma.auth.findMany.mockResolvedValue([
        { id: 'user-1', isActive: true, isBanned: false },
        { id: 'user-3', isActive: true, isBanned: false },
      ]);

      const result = await service.getEligibleCustomerIds(['turf-1']);
      expect(result).toEqual(['user-1', 'user-3']);
      expect(result).not.toContain('user-2');
    });

    it('returns empty array if no past bookings found', async () => {
      prisma.booking.findMany.mockResolvedValue([]);
      const result = await service.getEligibleCustomerIds(['turf-1']);
      expect(result).toEqual([]);
    });
  });

  describe('checkBroadcastRateLimit', () => {
    it('allows broadcast if within limit (< 2 in last 24 hours)', async () => {
      prisma.notificationLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          createdAt: new Date(),
          metadata: { turfId: 'turf-1' },
        },
      ]);

      await expect(
        service.checkBroadcastRateLimit('owner-prof-1', 'turf-1', ['turf-1']),
      ).resolves.toBeUndefined();
    });

    it('throws BadRequestException if rate limit of 2 broadcasts per turf per 24h is exceeded', async () => {
      prisma.notificationLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          createdAt: new Date(),
          metadata: { turfId: 'turf-1' },
        },
        {
          id: 'log-2',
          createdAt: new Date(),
          metadata: { turfId: 'turf-1' },
        },
      ]);

      await expect(
        service.checkBroadcastRateLimit('owner-prof-1', 'turf-1', ['turf-1']),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAudienceCount', () => {
    it('returns audience count and total bookings count', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(mockOwnerProfile);
      prisma.booking.count.mockResolvedValue(25);
      prisma.booking.findMany.mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-2' },
      ]);
      prisma.userSettings.findMany.mockResolvedValue([]);
      prisma.auth.findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);

      const result = await service.getAudienceCount('auth-owner-1', 'turf-1');

      expect(result.success).toBe(true);
      expect(result.audienceCount).toBe(2);
      expect(result.totalPastBookings).toBe(25);
      expect(result.targetTurfNames).toEqual(['Turf Arena A']);
    });
  });

  describe('broadcastOffer', () => {
    it('dispatches directly via NotificationsService when recipients <= 100', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(mockOwnerProfile);
      prisma.notificationLog.findMany.mockResolvedValue([]); // No recent broadcasts
      prisma.booking.findMany.mockResolvedValue([{ userId: 'user-1' }, { userId: 'user-2' }]);
      prisma.userSettings.findMany.mockResolvedValue([]);
      prisma.auth.findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);
      prisma.notificationLog.create.mockResolvedValue({ id: 'log-new' });

      const dto = {
        turfId: 'turf-1',
        title: '⚡ Weekend 20% Off Deal',
        message: 'Book your turf slot this weekend for a 20% discount!',
        offerCode: 'WEEKEND20',
        discountPercentage: 20,
      };

      const result = await service.broadcastOffer('auth-owner-1', dto);

      expect(result.success).toBe(true);
      expect(result.recipientsCount).toBe(2);
      expect(result.enqueued).toBe(false);
      expect(notificationsService.sendMulticastNotification).toHaveBeenCalledWith(
        ['user-1', 'user-2'],
        dto.title,
        dto.message,
        expect.objectContaining({
          type: 'TURF_OFFER',
          turfId: 'turf-1',
          offerCode: 'WEEKEND20',
          discountPercentage: '20',
        }),
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(prisma.notificationLog.create).toHaveBeenCalled();
    });

    it('enqueues to BullMQ notification queue when recipients > 100', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(mockOwnerProfile);
      prisma.notificationLog.findMany.mockResolvedValue([]);

      // Create 105 mock users
      const users = Array.from({ length: 105 }, (_, i) => ({ userId: `user-${i + 1}` }));
      prisma.booking.findMany.mockResolvedValue(users);
      prisma.userSettings.findMany.mockResolvedValue([]);
      prisma.auth.findMany.mockResolvedValue(users.map((u) => ({ id: u.userId })));
      prisma.notificationLog.create.mockResolvedValue({ id: 'log-enqueued' });

      const dto = {
        turfId: 'turf-1',
        title: '⚡ Mega Turf Flash Sale',
        message: 'Exclusive flash sale on all night slots tonight!',
      };

      const result = await service.broadcastOffer('auth-owner-1', dto);

      expect(result.success).toBe(true);
      expect(result.recipientsCount).toBe(105);
      expect(result.enqueued).toBe(true);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-multicast',
        expect.objectContaining({
          authIds: expect.arrayContaining(['user-1', 'user-105']),
          title: dto.title,
          body: dto.message,
        }),
        expect.any(Object),
      );
      expect(notificationsService.sendMulticastNotification).not.toHaveBeenCalled();
    });

    it('returns 0 recipients gracefully if no customers are eligible', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue(mockOwnerProfile);
      prisma.notificationLog.findMany.mockResolvedValue([]);
      prisma.booking.findMany.mockResolvedValue([]); // No past bookings

      const dto = {
        turfId: 'turf-1',
        title: '⚡ Special Offer',
        message: 'Book today and get special perks at our turf!',
      };

      const result = await service.broadcastOffer('auth-owner-1', dto);

      expect(result.success).toBe(true);
      expect(result.recipientsCount).toBe(0);
      expect(notificationsService.sendMulticastNotification).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('getBroadcastHistory', () => {
    it('returns paginated broadcast history for this owner', async () => {
      prisma.ownerProfile.findUnique.mockResolvedValue({ id: 'owner-prof-1' });
      prisma.notificationLog.count.mockResolvedValue(1);
      prisma.notificationLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          title: 'Offer Title',
          body: 'Offer Body',
          sentCount: 15,
          createdAt: new Date('2026-11-06T10:00:00Z'),
          metadata: {
            turfId: 'turf-1',
            turfNames: ['Turf Arena A'],
            offerCode: 'CODE10',
            discountPercentage: 10,
          },
        },
      ]);

      const result = await service.getBroadcastHistory('auth-owner-1', { page: 1, limit: 10 });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('log-1');
      expect(result.data[0].turfId).toBe('turf-1');
      expect(result.data[0].recipientCount).toBe(15);
      expect(result.meta.total).toBe(1);
    });
  });
});

