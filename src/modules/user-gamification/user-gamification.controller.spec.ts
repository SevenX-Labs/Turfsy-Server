import { Test, TestingModule } from '@nestjs/testing';
import { UserGamificationController } from './user-gamification.controller';
import { UserGamificationService } from './user-gamification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const mockUserGamificationService = {
  getOverallStats: jest.fn(),
  getUserStats: jest.fn(),
  getNudgeMessage: jest.fn(),
  getLeaderboardFiltered: jest.fn(),
  handleBookingCompletion: jest.fn(),
};

describe('UserGamificationController', () => {
  let controller: UserGamificationController;

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [UserGamificationController],
      providers: [
        {
          provide: UserGamificationService,
          useValue: mockUserGamificationService,
        },
      ],
    });

    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({
      canActivate: jest.fn().mockResolvedValue(true),
    });

    const module: TestingModule = await moduleBuilder.compile();

    controller = module.get<UserGamificationController>(
      UserGamificationController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getOverall', () => {
    it('should return overall stats for the user', async () => {
      const mockResult = {
        streak: 5,
        points: 100,
        totalMatches: 2,
        totalHours: 2.5,
        leaderboard: { top10: [], currentUser: { rank: 1, name: 'You', points: 100 } },
        nudge: 'Keep it up!',
        inactivityPenaltyApplied: false,
        penaltyReason: null,
      };
      mockUserGamificationService.getOverallStats.mockResolvedValue(mockResult);

      const req = { user: { authId: 'user-1' } };
      const response = await controller.getOverall(req);

      expect(response).toEqual(mockResult);
      expect(mockUserGamificationService.getOverallStats).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getStreak', () => {
    it('should return streak stats for the user', async () => {
      mockUserGamificationService.getUserStats.mockResolvedValue({ streak: 5 });

      const req = { user: { authId: 'user-1' } };
      const response = await controller.getStreak(req);

      expect(response).toEqual({ streak: 5 });
    });
  });

  describe('getNudge', () => {
    it('should return nudge message for the user', async () => {
      mockUserGamificationService.getNudgeMessage.mockResolvedValue('Keep pushing!');

      const req = { user: { authId: 'user-1' } };
      const response = await controller.getNudge(req);

      expect(response).toEqual({ message: 'Keep pushing!' });
    });
  });
});
