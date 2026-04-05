import { Test, TestingModule } from '@nestjs/testing';
import { OwnerSettingsService } from './owner-settings.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('OwnerSettingsService', () => {
  let service: OwnerSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerSettingsService,
        {
          provide: PrismaService,
          useValue: {
            auth: { findUnique: jest.fn() },
            ownerSettings: { upsert: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<OwnerSettingsService>(OwnerSettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
