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
import { Role, TurfStatus } from '@prisma/client';

@Injectable()
export class OwnerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────
  // Create Owner Profile
  // ─────────────────────────────────────────

  async createProfile(authId: string, dto: CreateOwnerProfileDto) {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
      include: { ownerProfile: true },
    });

    if (!auth) throw new NotFoundException('Account not found');
    if (!auth.isVerified) throw new ForbiddenException('Please verify your phone number first');
    if (auth.role !== Role.OWNER)
      throw new ForbiddenException('Only OWNER role can create owner profile');
    if (auth.ownerProfile?.name)
      throw new ConflictException('Profile already created');

    // Check email uniqueness
    const emailExists = await this.prisma.ownerProfile.findUnique({
      where: { email: dto.email },
    });
    if (emailExists) throw new ConflictException('Email already in use');

    const profile = await this.prisma.ownerProfile.update({
      where: { authId },
      data: {
        name: dto.name,
        email: dto.email,
        contactNumber: dto.contactNumber,
        aadharNumber: dto.aadharNumber,
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
      include: { turfs: true, payment: true },
    });

    if (!profile) throw new NotFoundException('Profile not found');

    return {
      success: true,
      data: profile,
    };
  }

  // ─────────────────────────────────────────
  // Update Owner Profile
  // ─────────────────────────────────────────

  async updateProfile(authId: string, dto: UpdateOwnerProfileDto) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Profile not found');

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
        ...(dto.contactNumber !== undefined && { contactNumber: dto.contactNumber }),
      },
    });

    return {
      success: true,
      message: 'Owner profile updated successfully',
      data: updated,
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
