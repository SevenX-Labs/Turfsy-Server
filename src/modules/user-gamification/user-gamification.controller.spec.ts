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
});
