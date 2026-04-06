import { Test, TestingModule } from '@nestjs/testing';
import { OwnerHomeService } from './owner-home.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
  ownerProfile: { findUnique: jest.fn() },
  booking: { findMany: jest.fn() },
};

describe('OwnerHomeService', () => {
  let service: OwnerHomeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerHomeService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OwnerHomeService>(OwnerHomeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
