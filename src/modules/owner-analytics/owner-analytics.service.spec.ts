import { Test, TestingModule } from '@nestjs/testing';
import { OwnerAnalyticsService } from './owner-analytics.service';

describe('OwnerAnalyticsService', () => {
  let service: OwnerAnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OwnerAnalyticsService],
    }).compile();

    service = module.get<OwnerAnalyticsService>(OwnerAnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
