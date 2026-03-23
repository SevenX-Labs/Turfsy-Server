import { Test, TestingModule } from '@nestjs/testing';
import { TurfsService } from './turfs.service';

describe('TurfsService', () => {
  let service: TurfsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TurfsService],
    }).compile();

    service = module.get<TurfsService>(TurfsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
