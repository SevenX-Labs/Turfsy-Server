import { Test, TestingModule } from '@nestjs/testing';
import { OwnerAnalyticsService } from './owner-analytics.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
  ownerProfile: { findUnique: jest.fn() },
  booking: { findMany: jest.fn() },
};

describe('OwnerAnalyticsService', () => {
  let service: OwnerAnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OwnerAnalyticsService>(OwnerAnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
