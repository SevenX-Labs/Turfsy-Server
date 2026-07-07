import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSlabDto } from './dto/create-slab.dto';
import { UpdateSlabDto } from './dto/update-slab.dto';

@Injectable()
export class PlatformFeeSlabService {
  constructor(private readonly prisma: PrismaService) {}

  private async validateSlabRange(
    minAmount: number,
    maxAmount: number,
    platformFee: number,
    isActive: boolean,
    excludeId?: string,
  ) {
    if (minAmount > maxAmount) {
      throw new BadRequestException('minAmount cannot be greater than maxAmount');
    }
    if (platformFee < 0) {
      throw new BadRequestException('Platform Fee cannot be negative');
    }
    if (isActive) {
      const overlapping = await this.prisma.platformFeeSlab.findFirst({
        where: {
          isActive: true,
          id: excludeId ? { not: excludeId } : undefined,
          minAmount: { lte: maxAmount },
          maxAmount: { gte: minAmount },
        },
      });
      if (overlapping) {
        throw new BadRequestException('Slab ranges overlap with an existing active slab');
      }
    }
  }

  async create(dto: CreateSlabDto) {
    const isActive = dto.isActive ?? true;
    await this.validateSlabRange(dto.minAmount, dto.maxAmount, dto.platformFee, isActive);

    return this.prisma.platformFeeSlab.create({
      data: {
        minAmount: dto.minAmount,
        maxAmount: dto.maxAmount,
        platformFee: dto.platformFee,
        isActive,
      },
    });
  }

  async findAll() {
    return this.prisma.platformFeeSlab.findMany({
      orderBy: { minAmount: 'asc' },
    });
  }

  async findActive() {
    return this.prisma.platformFeeSlab.findMany({
      where: { isActive: true },
      orderBy: { minAmount: 'asc' },
    });
  }

  async findOne(id: string) {
    const slab = await this.prisma.platformFeeSlab.findUnique({
      where: { id },
    });
    if (!slab) {
      throw new NotFoundException(`Platform Fee Slab with ID ${id} not found`);
    }
    return slab;
  }

  async update(id: string, dto: UpdateSlabDto) {
    const existing = await this.findOne(id);

    const minAmount = dto.minAmount !== undefined ? dto.minAmount : existing.minAmount;
    const maxAmount = dto.maxAmount !== undefined ? dto.maxAmount : existing.maxAmount;
    const platformFee = dto.platformFee !== undefined ? dto.platformFee : existing.platformFee;
    const isActive = dto.isActive !== undefined ? dto.isActive : existing.isActive;

    await this.validateSlabRange(minAmount, maxAmount, platformFee, isActive, id);

    return this.prisma.platformFeeSlab.update({
      where: { id },
      data: {
        minAmount,
        maxAmount,
        platformFee,
        isActive,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.platformFeeSlab.delete({
      where: { id },
    });
  }
}
