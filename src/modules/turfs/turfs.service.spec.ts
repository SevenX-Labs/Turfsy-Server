import { Test, TestingModule } from '@nestjs/testing';
import { TurfsService } from './turfs.service';
import { PrismaService } from '../../prisma/prisma.service';

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
      ],
    }).compile();

    service = module.get<TurfsService>(TurfsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
