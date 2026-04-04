import { Test, TestingModule } from '@nestjs/testing';
import { OwnerSettingsController } from './owner-settings.controller';
import { OwnerSettingsService } from './owner-settings.service';

describe('OwnerSettingsController', () => {
  let controller: OwnerSettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OwnerSettingsController],
      providers: [OwnerSettingsService],
    }).compile();

    controller = module.get<OwnerSettingsController>(OwnerSettingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
