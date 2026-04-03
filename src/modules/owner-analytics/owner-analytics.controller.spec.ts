import { Test, TestingModule } from '@nestjs/testing';
import { OwnerAnalyticsController } from './owner-analytics.controller';
import { OwnerAnalyticsService } from './owner-analytics.service';

describe('OwnerAnalyticsController', () => {
  let controller: OwnerAnalyticsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OwnerAnalyticsController],
      providers: [OwnerAnalyticsService],
    }).compile();

    controller = module.get<OwnerAnalyticsController>(OwnerAnalyticsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
