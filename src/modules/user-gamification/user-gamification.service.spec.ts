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
    it('should deduct 2 points on cancellation', async () => {
      mockPrisma.userGamification.upsert.mockImplementation((args) => {
        return {
          authId: args.create.authId,
          points: args.create.points,
        };
      });

      const result = await service.handleBookingCancellation('user-1');

      expect(result.points).toBe(-2);
      expect(mockPrisma.userGamification.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { authId: 'user-1' },
          update: {
            points: { decrement: 2 },
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

    it('should decay points by 5 and streak by 1 for 6 days of inactivity (1 period)', async () => {
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
          points: mockStats.points - 5,
        };
      });

      const result = await service.getUserStats('user-1');

      expect(result.streak).toBe(4);
      expect(result.points).toBe(95);
      expect(mockPrisma.userGamification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { authId: 'user-1' },
          data: expect.objectContaining({
            points: { decrement: 5 },
            streak: { set: 4 },
          }),
        }),
      );
    });

    it('should decay progressively for multiple periods (e.g. 12 days -> 2 periods)', async () => {
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
          points: mockStats.points - 10,
        };
      });

      const result = await service.getUserStats('user-1');

      expect(result.streak).toBe(3);
      expect(result.points).toBe(90);
      expect(mockPrisma.userGamification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { authId: 'user-1' },
          data: expect.objectContaining({
            points: { decrement: 10 },
            streak: { set: 3 },
          }),
        }),
      );
    });
  });
});
