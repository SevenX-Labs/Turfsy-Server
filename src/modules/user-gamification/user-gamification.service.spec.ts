import { Test, TestingModule } from '@nestjs/testing';
import { UserGamificationService } from './user-gamification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../common/notifications/notifications.service';

const mockPrisma = {
  booking: { findUnique: jest.fn() },
  userGamification: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
  },
};

describe('UserGamificationService', () => {
  let service: UserGamificationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserGamificationService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: NotificationsService,
          useValue: {
            sendNotification: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<UserGamificationService>(UserGamificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleBookingCompletion', () => {
    it('should award 10 points on completion when profile is newly created', async () => {
      const mockBooking = {
        id: 'booking-1',
        userId: 'user-1',
        bookingStatus: 'COMPLETED',
        durationMins: 60,
      };
      mockPrisma.booking.findUnique.mockResolvedValue(mockBooking);
      mockPrisma.userGamification.findUnique.mockResolvedValue(null);
      mockPrisma.userGamification.create.mockImplementation((args) => args.data);

      const result = await service.handleBookingCompletion('user-1', 'booking-1');

      expect(result).toBeDefined();
      expect(result.points).toBe(10);
      expect(result.streak).toBe(1);
    });
  });

  describe('handleBookingCancellation', () => {
    it('should deduct 2 points on cancellation but floor at 0', async () => {
      const mockStats = { authId: 'user-1', points: 1, streak: 5 };
      mockPrisma.userGamification.findUnique.mockResolvedValue(mockStats);
      mockPrisma.userGamification.update.mockImplementation((args) => {
        return {
          authId: 'user-1',
          points: args.data.points,
        };
      });

      const result = await service.handleBookingCancellation('user-1');

      expect(result.points).toBe(0); // Floored to 0
      expect(mockPrisma.userGamification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { authId: 'user-1' },
          data: {
            points: 0,
          },
        }),
      );
    });
  });

  describe('handleNoShow', () => {
    it('should deduct 5 points and break streak, flooring points at 0', async () => {
      const mockStats = { authId: 'user-1', points: 4, streak: 5 };
      mockPrisma.userGamification.findUnique.mockResolvedValue(mockStats);
      mockPrisma.userGamification.update.mockImplementation((args) => {
        return {
          authId: 'user-1',
          streak: args.data.streak,
          points: args.data.points,
        };
      });

      const result = await service.handleNoShow('user-1', 'booking-1');

      expect(result.streak).toBe(0);
      expect(result.points).toBe(0); // Floored to 0
      expect(mockPrisma.userGamification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { authId: 'user-1' },
          data: {
            streak: 0,
            points: 0,
          },
        }),
      );
    });
  });

  describe('applyInactivityDecay', () => {
    it('should not decay stats if user has played within 5 days', async () => {
      const lastPlayedDate = new Date();
      lastPlayedDate.setDate(lastPlayedDate.getDate() - 3); // 3 days ago
      const mockStats = {
        authId: 'user-1',
        streak: 5,
        points: 100,
        lastPlayedDate,
      };

      mockPrisma.userGamification.findUnique.mockResolvedValue(mockStats);

      const result = await service.getUserStats('user-1');

      expect(result).toEqual(mockStats);
      expect(mockPrisma.userGamification.update).not.toHaveBeenCalled();
    });

    it('should decay streak by 1 for 6 days of inactivity (1 period) without deducting points', async () => {
      const lastPlayedDate = new Date();
      lastPlayedDate.setDate(lastPlayedDate.getDate() - 6); // 6 days ago
      const mockStats = {
        authId: 'user-1',
        streak: 5,
        points: 100,
        lastPlayedDate,
      };

      mockPrisma.userGamification.findUnique.mockResolvedValue(mockStats);
      mockPrisma.userGamification.update.mockImplementation((args) => {
        return {
          authId: 'user-1',
          streak: Math.max(0, mockStats.streak - 1),
          points: mockStats.points,
        };
      });

      const result = await service.getUserStats('user-1');

      expect(result.streak).toBe(4);
      expect(result.points).toBe(100); // Unchanged
      expect(mockPrisma.userGamification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { authId: 'user-1' },
          data: expect.objectContaining({
            streak: { set: 4 },
          }),
        }),
      );
    });

    it('should decay streak progressively for multiple periods (e.g. 12 days -> 2 periods) without deducting points', async () => {
      const lastPlayedDate = new Date();
      lastPlayedDate.setDate(lastPlayedDate.getDate() - 12); // 12 days ago
      const mockStats = {
        authId: 'user-1',
        streak: 5,
        points: 100,
        lastPlayedDate,
      };

      mockPrisma.userGamification.findUnique.mockResolvedValue(mockStats);
      mockPrisma.userGamification.update.mockImplementation((args) => {
        return {
          authId: 'user-1',
          streak: Math.max(0, mockStats.streak - 2),
          points: mockStats.points,
        };
      });

      const result = await service.getUserStats('user-1');

      expect(result.streak).toBe(3);
      expect(result.points).toBe(100); // Unchanged
      expect(mockPrisma.userGamification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { authId: 'user-1' },
          data: expect.objectContaining({
            streak: { set: 3 },
          }),
        }),
      );
    });
  });
});
