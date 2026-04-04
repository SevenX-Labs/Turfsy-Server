import { Test, TestingModule } from '@nestjs/testing';
import { UserGamificationService } from './user-gamification.service';

describe('UserGamificationService', () => {
  let service: UserGamificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserGamificationService],
    }).compile();

    service = module.get<UserGamificationService>(UserGamificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
