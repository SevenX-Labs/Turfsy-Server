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
import { CreateTurfDto } from './dto/create-turf.dto';
import { UpdateTurfDto } from './dto/update-turf.dto';
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
  // Upload Owner Avatar
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
  // Create Turf
  // ─────────────────────────────────────────

  async createTurf(authId: string, dto: CreateTurfDto) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Owner profile not found');
    if (!profile.name)
      throw new ForbiddenException('Please complete your owner profile first');

    const turf = await this.prisma.turf.create({
      data: {
        ownerProfileId: profile.id,
        name: dto.name,
        description: dto.description,
        sportsType: dto.sportsType,
        turfSize: dto.turfSize,
        address: dto.address,
        city: dto.city,
        pincode: dto.pincode,
        lat: dto.lat,
        lng: dto.lng,
        openTime: dto.openTime,
        closeTime: dto.closeTime,
        minSlotDurationMins: dto.minSlotDurationMins,
        floodLights: dto.floodLights ?? false,
        parking: dto.parking ?? false,
        washroom: dto.washroom ?? false,
        changingRoom: dto.changingRoom ?? false,
        drinkingWater: dto.drinkingWater ?? false,
        seatingArea: dto.seatingArea ?? false,
        cafeteria: dto.cafeteria ?? false,
        weekdayDayPrice: dto.weekdayDayPrice,
        weekdayNightPrice: dto.weekdayNightPrice,
        weekendDayPrice: dto.weekendDayPrice,
        weekendNightPrice: dto.weekendNightPrice,
        // Images default to empty, uploaded separately
        groundDayUrl: '',
        entranceUrl: '',
      },
    });

    return {
      success: true,
      message: 'Turf created successfully',
      data: turf,
    };
  }

  // ─────────────────────────────────────────
  // Get All My Turfs
  // ─────────────────────────────────────────

  async getMyTurfs(authId: string) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Owner profile not found');

    const turfs = await this.prisma.turf.findMany({
      where: { ownerProfileId: profile.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: turfs,
    };
  }

  // ─────────────────────────────────────────
  // Update Turf
  // ─────────────────────────────────────────

  async updateTurf(authId: string, turfId: string, dto: UpdateTurfDto) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Owner profile not found');

    const turf = await this.prisma.turf.findUnique({ where: { id: turfId } });
    if (!turf) throw new NotFoundException('Turf not found');
    if (turf.ownerProfileId !== profile.id)
      throw new ForbiddenException('You are not allowed to update this turf');

    const updated = await this.prisma.turf.update({
      where: { id: turfId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.sportsType !== undefined && { sportsType: dto.sportsType }),
        ...(dto.turfSize !== undefined && { turfSize: dto.turfSize }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.pincode !== undefined && { pincode: dto.pincode }),
        ...(dto.lat !== undefined && { lat: dto.lat }),
        ...(dto.lng !== undefined && { lng: dto.lng }),
        ...(dto.openTime !== undefined && { openTime: dto.openTime }),
        ...(dto.closeTime !== undefined && { closeTime: dto.closeTime }),
        ...(dto.minSlotDurationMins !== undefined && { minSlotDurationMins: dto.minSlotDurationMins }),
        ...(dto.floodLights !== undefined && { floodLights: dto.floodLights }),
        ...(dto.parking !== undefined && { parking: dto.parking }),
        ...(dto.washroom !== undefined && { washroom: dto.washroom }),
        ...(dto.changingRoom !== undefined && { changingRoom: dto.changingRoom }),
        ...(dto.drinkingWater !== undefined && { drinkingWater: dto.drinkingWater }),
        ...(dto.seatingArea !== undefined && { seatingArea: dto.seatingArea }),
        ...(dto.cafeteria !== undefined && { cafeteria: dto.cafeteria }),
        ...(dto.weekdayDayPrice !== undefined && { weekdayDayPrice: dto.weekdayDayPrice }),
        ...(dto.weekdayNightPrice !== undefined && { weekdayNightPrice: dto.weekdayNightPrice }),
        ...(dto.weekendDayPrice !== undefined && { weekendDayPrice: dto.weekendDayPrice }),
        ...(dto.weekendNightPrice !== undefined && { weekendNightPrice: dto.weekendNightPrice }),
      },
    });

    return {
      success: true,
      message: 'Turf updated successfully',
      data: updated,
    };
  }

  // ─────────────────────────────────────────
  // Upload Turf Images
  // ─────────────────────────────────────────

  async updateTurfImages(
    authId: string,
    turfId: string,
    images: {
      groundDayUrl?: string;
      groundNightUrl?: string;
      entranceUrl?: string;
      seatingAreaUrl?: string;
    },
  ) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Owner profile not found');

    const turf = await this.prisma.turf.findUnique({ where: { id: turfId } });
    if (!turf) throw new NotFoundException('Turf not found');
    if (turf.ownerProfileId !== profile.id)
      throw new ForbiddenException('You are not allowed to update this turf');

    const updated = await this.prisma.turf.update({
      where: { id: turfId },
      data: {
        ...(images.groundDayUrl && { groundDayUrl: images.groundDayUrl }),
        ...(images.groundNightUrl && { groundNightUrl: images.groundNightUrl }),
        ...(images.entranceUrl && { entranceUrl: images.entranceUrl }),
        ...(images.seatingAreaUrl && { seatingAreaUrl: images.seatingAreaUrl }),
      },
    });

    return {
      success: true,
      message: 'Turf images updated successfully',
      data: {
        groundDayUrl: updated.groundDayUrl,
        groundNightUrl: updated.groundNightUrl,
        entranceUrl: updated.entranceUrl,
        seatingAreaUrl: updated.seatingAreaUrl,
      },
    };
  }

  // ─────────────────────────────────────────
  // Update Turf Status
  // ─────────────────────────────────────────

  async updateTurfStatus(authId: string, turfId: string, status: TurfStatus) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Owner profile not found');

    const turf = await this.prisma.turf.findUnique({ where: { id: turfId } });
    if (!turf) throw new NotFoundException('Turf not found');
    if (turf.ownerProfileId !== profile.id)
      throw new ForbiddenException('You are not allowed to update this turf');

    const updated = await this.prisma.turf.update({
      where: { id: turfId },
      data: { status },
    });

    return {
      success: true,
      message: `Turf status updated to ${status}`,
      data: { id: updated.id, status: updated.status },
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
