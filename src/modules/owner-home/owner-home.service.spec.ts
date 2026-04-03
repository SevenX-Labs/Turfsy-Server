import { Test, TestingModule } from '@nestjs/testing';
import { OwnerHomeService } from './owner-home.service';

describe('OwnerHomeService', () => {
  let service: OwnerHomeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OwnerHomeService],
    }).compile();

    service = module.get<OwnerHomeService>(OwnerHomeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
