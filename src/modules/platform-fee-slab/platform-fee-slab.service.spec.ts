import { Test, TestingModule } from '@nestjs/testing';
import { PlatformFeeSlabService } from './platform-fee-slab.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('PlatformFeeSlabService', () => {
  let service: PlatformFeeSlabService;
  let prisma: PrismaService;

  const mockPrisma = {
    platformFeeSlab: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformFeeSlabService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<PlatformFeeSlabService>(PlatformFeeSlabService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a valid slab successfully', async () => {
      const dto = {
        minAmount: 0,
        maxAmount: 1000,
        platformFee: 50,
        isActive: true,
      };
      mockPrisma.platformFeeSlab.findFirst.mockResolvedValue(null);
      mockPrisma.platformFeeSlab.create.mockResolvedValue({
        id: 'slab-1',
        ...dto,
      });

      const result = await service.create(dto);
      expect(result).toBeDefined();
      expect(result.id).toBe('slab-1');
      expect(mockPrisma.platformFeeSlab.create).toHaveBeenCalledWith({
        data: dto,
      });
    });

    it('should throw BadRequestException if minAmount > maxAmount', async () => {
      const dto = {
        minAmount: 2000,
        maxAmount: 1000,
        platformFee: 50,
        isActive: true,
      };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if platformFee is negative', async () => {
      const dto = {
        minAmount: 0,
        maxAmount: 1000,
        platformFee: -10,
        isActive: true,
      };
      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if new active slab overlaps with existing active slab', async () => {
      const dto = {
        minAmount: 500,
        maxAmount: 1500,
        platformFee: 50,
        isActive: true,
      };
      mockPrisma.platformFeeSlab.findFirst.mockResolvedValue({
        id: 'existing-slab',
      });

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should update a slab successfully', async () => {
      const existing = {
        id: 'slab-1',
        minAmount: 0,
        maxAmount: 1000,
        platformFee: 50,
        isActive: true,
      };
      mockPrisma.platformFeeSlab.findUnique.mockResolvedValue(existing);
      mockPrisma.platformFeeSlab.findFirst.mockResolvedValue(null);
      mockPrisma.platformFeeSlab.update.mockResolvedValue({
        ...existing,
        maxAmount: 1200,
      });

      const result = await service.update('slab-1', { maxAmount: 1200 });
      expect(result.maxAmount).toBe(1200);
    });

    it('should throw NotFoundException if updating non-existent slab', async () => {
      mockPrisma.platformFeeSlab.findUnique.mockResolvedValue(null);
      await expect(
        service.update('invalid-id', { maxAmount: 1200 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove a slab successfully', async () => {
      const existing = {
        id: 'slab-1',
        minAmount: 0,
        maxAmount: 1000,
        platformFee: 50,
        isActive: true,
      };
      mockPrisma.platformFeeSlab.findUnique.mockResolvedValue(existing);
      mockPrisma.platformFeeSlab.delete.mockResolvedValue(existing);

      const result = await service.remove('slab-1');
      expect(result).toEqual(existing);
    });
  });
});
