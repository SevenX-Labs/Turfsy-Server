import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOwnerProfileDto } from './dto/create-owner-profile.dto';
import { UpdateOwnerProfileDto } from './dto/update-owner-profile.dto';
import { OwnerPaymentDetailsDto } from './dto/owner-payment-details.dto';
import { Role } from '@prisma/client';

@Injectable()
export class OwnerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  private async normalizeOwnerTurfStatuses(authId: string) {
    await this.prisma.$executeRaw`
      UPDATE "Turf"
      SET "status" = 'INACTIVE'::"TurfStatus"
      WHERE EXISTS (
        SELECT 1
        FROM "OwnerProfile" op
        WHERE op."id" = "Turf"."ownerProfileId"
          AND op."authId" = ${authId}
      )
        AND "status"::text NOT IN ('ACTIVE', 'INACTIVE')
    `;
  }

  // ─────────────────────────────────────────
  // Create Owner Profile
  // ─────────────────────────────────────────

  async createProfile(authId: string, dto: CreateOwnerProfileDto) {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
      include: { ownerProfile: true },
    });

    if (!auth) throw new NotFoundException('Account not found');
    if (!auth.isVerified)
      throw new ForbiddenException('Please verify your phone number first');
    if (auth.role !== Role.OWNER)
      throw new ForbiddenException('Only OWNER role can create owner profile');
    if (auth.ownerProfile?.name)
      throw new ConflictException('Profile already created');
    if (dto.contactNumber !== auth.phone) {
      throw new BadRequestException(
        'Contact number must match the verified login phone number',
      );
    }

    // Check email uniqueness
    const emailExists = await this.prisma.ownerProfile.findUnique({
      where: { email: dto.email },
    });
    if (emailExists) throw new ConflictException('Email already in use');

    const profile = await this.prisma.ownerProfile.upsert({
      where: { authId },
      create: {
        authId,
        name: dto.name,
        email: dto.email,
        contactNumber: auth.phone,
      },
      update: {
        name: dto.name,
        email: dto.email,
        contactNumber: auth.phone,
      },
    });

    return {
      success: true,
      message: 'Owner profile created successfully',
      data: profile,
    };
  }

  // ─────────────────────────────────────────
  // Get Own Profile
  // ─────────────────────────────────────────

  async getProfile(authId: string) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
      include: { payment: true },
    });

    if (!profile) throw new NotFoundException('Profile not found');

    await this.normalizeOwnerTurfStatuses(authId);

    const turfs = await this.prisma.turf.findMany({
      where: {
        owner: { authId },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: {
        ...profile,
        turfs,
      },
    };
  }

  // ─────────────────────────────────────────
  // Update Owner Profile
  // ─────────────────────────────────────────

  async updateProfile(authId: string, dto: UpdateOwnerProfileDto) {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
      select: { phone: true },
    });
    if (!auth) throw new NotFoundException('Account not found');

    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Profile not found');
    if (dto.contactNumber !== undefined && dto.contactNumber !== auth.phone) {
      throw new BadRequestException(
        'Contact number must match the verified login phone number',
      );
    }

    // Check email uniqueness if changed
    if (dto.email && dto.email !== profile.email) {
      const emailExists = await this.prisma.ownerProfile.findUnique({
        where: { email: dto.email },
      });
      if (emailExists) throw new ConflictException('Email already in use');
    }

    const updated = await this.prisma.ownerProfile.update({
      where: { authId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.aadharNumber !== undefined && {
          aadharNumber: dto.aadharNumber,
        }),
        ...(dto.aadharUrl !== undefined && { aadharUrl: dto.aadharUrl }),
        // Always mirror the verified auth phone in owner profile.
        contactNumber: auth.phone,
      },
      include: { payment: true },
    });

    const hasPaymentDetails =
      dto.bankHolderName !== undefined ||
      dto.bankName !== undefined ||
      dto.accountNumber !== undefined ||
      dto.ifscCode !== undefined ||
      dto.upiId !== undefined;

    if (hasPaymentDetails) {
      if (updated.payment) {
        await this.prisma.payment.update({
          where: { authId },
          data: {
            ...(dto.bankHolderName !== undefined && {
              bankHolderName: dto.bankHolderName,
            }),
            ...(dto.bankName !== undefined && { bankName: dto.bankName }),
            ...(dto.accountNumber !== undefined && {
              accountNumber: dto.accountNumber,
            }),
            ...(dto.ifscCode !== undefined && { ifscCode: dto.ifscCode }),
            ...(dto.upiId !== undefined && { upiId: dto.upiId }),
          },
        });
      } else {
        await this.prisma.payment.create({
          data: {
            authId,
            role: 'OWNER',
            ownerProfileId: updated.id,
            bankHolderName: dto.bankHolderName,
            bankName: dto.bankName,
            accountNumber: dto.accountNumber,
            ifscCode: dto.ifscCode,
            upiId: dto.upiId,
          },
        });
      }
    }

    const finalProfile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
      include: { payment: true },
    });

    return {
      success: true,
      message: 'Owner profile updated successfully',
      data: finalProfile,
    };
  }

  // ─────────────────────────────────────────
  // Upload Owner Avatar (local disk)
  // ─────────────────────────────────────────

  async updateAvatar(authId: string, avatarUrl: string) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Profile not found');

    const updated = await this.prisma.ownerProfile.update({
      where: { authId },
      data: { avatarUrl },
    });

    return {
      success: true,
      message: 'Avatar updated successfully',
      data: { avatarUrl: updated.avatarUrl },
    };
  }

  // ─────────────────────────────────────────
  // Save Payment Details (UPI)
  // ─────────────────────────────────────────

  async savePaymentDetails(authId: string, dto: OwnerPaymentDetailsDto) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Owner profile not found');

    const payment = await this.prisma.payment.upsert({
      where: { authId },
      update: { upiId: dto.upiId },
      create: {
        authId,
        role: Role.OWNER,
        upiId: dto.upiId,
        ownerProfileId: profile.id,
      },
    });

    return {
      success: true,
      message: 'Payment details saved successfully',
      data: { upiId: payment.upiId },
    };
  }
}
