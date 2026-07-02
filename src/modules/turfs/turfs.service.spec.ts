import { Test, TestingModule } from '@nestjs/testing';
import { TurfsService } from './turfs.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/services/cache.service';

const mockPrisma = {
  ownerProfile: { findUnique: jest.fn() },
  turf: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findFirstOrThrow: jest.fn(),
  },
};

describe('TurfsService', () => {
  let service: TurfsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TurfsService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            invalidate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TurfsService>(TurfsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
