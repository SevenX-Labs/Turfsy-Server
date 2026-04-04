import { Test, TestingModule } from '@nestjs/testing';
import { UserGamificationController } from './user-gamification.controller';
import { UserGamificationService } from './user-gamification.service';

describe('UserGamificationController', () => {
  let controller: UserGamificationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserGamificationController],
      providers: [UserGamificationService],
    }).compile();

    controller = module.get<UserGamificationController>(UserGamificationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
