import { Test, TestingModule } from '@nestjs/testing';
import { OwnerSettingsService } from './owner-settings.service';

describe('OwnerSettingsService', () => {
  let service: OwnerSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OwnerSettingsService],
    }).compile();

    service = module.get<OwnerSettingsService>(OwnerSettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
