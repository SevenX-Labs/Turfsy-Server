import { Test, TestingModule } from '@nestjs/testing';
import { OwnerProfileService } from './owner-profile.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
  auth: { findUnique: jest.fn() },
  ownerProfile: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  payment: { upsert: jest.fn() },
  turf: { findMany: jest.fn() },
  $executeRaw: jest.fn(),
};

describe('OwnerProfileService', () => {
  let service: OwnerProfileService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerProfileService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OwnerProfileService>(OwnerProfileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
