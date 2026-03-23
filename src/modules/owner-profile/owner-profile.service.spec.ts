import { Test, TestingModule } from '@nestjs/testing';
import { OwnerProfileService } from './owner-profile.service';

describe('OwnerProfileService', () => {
  let service: OwnerProfileService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OwnerProfileService],
    }).compile();

    service = module.get<OwnerProfileService>(OwnerProfileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
