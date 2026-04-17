import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/services/cache.service';
import { CreateUserProfileDto } from './dto/create-profile.dto';
import { UpdateUserProfileDto } from './dto/update-profile.dto';
import { PaymentDetailsDto } from './dto/payment-details.dto';
import { Role, SportsType } from '@prisma/client';

@Injectable()
export class UserProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // Helper to format multiple manual fields into the single 'address' string
  private formatAddress(dto: any): string {
    const parts = [
      dto.houseNumber,
      dto.societyName,
      dto.landmark,
      dto.roadName,
    ].filter((part) => part && part.trim().length > 0);

    return parts.join(', ');
  }

  async checkUsernameAvailability(username: string) {
    const regex = /^[a-z0-9_]{4,20}$/;
    if (!regex.test(username)) {
      throw new BadRequestException(
        'Username must be 4-20 chars and contain only lowercase letters, numbers, and underscores',
      );
    }

    const existing = await this.prisma.userProfile.findUnique({
      where: { username },
    });

    if (existing) {
      return { available: false, message: 'Username is already taken' };
    }

    return { available: true, message: 'Username is available' };
  }

  // Create profile - stores basic GPS info from Expo
  async createProfile(authId: string, dto: CreateUserProfileDto) {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
      include: { userProfile: true },
    });

    if (!auth) throw new NotFoundException('Account not found');
    if (!auth.isVerified)
      throw new ForbiddenException('Please verify phone number first');

    // Re-validate username uniqueness before saving
    if (dto.username) {
      const isTaken = await this.prisma.userProfile.findFirst({
        where: {
          username: dto.username,
          authId: { not: authId },
        },
      });
      if (isTaken) {
        throw new BadRequestException('Username is already taken');
      }
    }

    const profile = await this.prisma.userProfile.upsert({
      where: { authId },
      create: {
        authId,
        username: dto.username,
        name: dto.name,
        email: dto.email,
        dob: new Date(dto.dob),
        gender: dto.gender,
        preferredSport: dto.preferredSport ?? null,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        currentLat: dto.currentLat,
        currentLng: dto.currentLng,
      },
      update: {
        username: dto.username,
        name: dto.name,
        email: dto.email,
        dob: new Date(dto.dob),
        gender: dto.gender,
        preferredSport: dto.preferredSport ?? null,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        currentLat: dto.currentLat,
        currentLng: dto.currentLng,
      },
    });

    // Invalidate profile cache after create/update
    this.cache.invalidate(`profile:${authId}`);
    this.cache.invalidate(`auth:getMe:${authId}`);

    return { success: true, message: 'Profile created', data: profile };
  }

  // Get profile (cached for 2 minutes)
  async getProfile(authId: string) {
    return this.cache.getOrSet(
      `profile:${authId}`,
      async () => {
        const profile = await this.prisma.userProfile.findUnique({
          where: { authId },
          include: { payment: true },
        });
        if (!profile) throw new NotFoundException('Profile not found');
        return { success: true, data: profile };
      },
      1000 * 60 * 2, // 2-minute TTL
    );
  }

  // Update Address (Handles both GPS updates and Manual House/Society additions)
  async updateHomeAddress(authId: string, dto: UpdateUserProfileDto) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { authId },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    const updated = await this.prisma.userProfile.update({
      where: { authId },
      data: {
        address: this.formatAddress(dto) || undefined,
        city: dto.city ?? undefined,
        state: dto.state ?? undefined,
        pincode: dto.pincode ?? undefined,
        currentLat: dto.currentLat ?? undefined,
        currentLng: dto.currentLng ?? undefined,
      },
    });

    // Invalidate caches on address update
    this.cache.invalidate(`profile:${authId}`);
    this.cache.invalidate(`auth:getMe:${authId}`);

    return {
      success: true,
      message: 'Address updated successfully',
      data: updated,
    };
  }

  // Update profile fields
  async updateProfile(authId: string, dto: UpdateUserProfileDto) {
    // Reuse the address update logic if address fields are present
    const data: any = { ...dto };
    if (dto.dob) data.dob = new Date(dto.dob);

    // If any address part is sent, re-format the main address string
    if (dto.houseNumber || dto.societyName || dto.landmark || dto.roadName) {
      data.address = this.formatAddress(dto);
    }

    // Re-validate username uniqueness if changed
    if (dto.username) {
      const isTaken = await this.prisma.userProfile.findFirst({
        where: {
          username: dto.username,
          authId: { not: authId },
        },
      });
      if (isTaken) {
        throw new BadRequestException('Username is already taken');
      }
    }

    const updated = await this.prisma.userProfile.update({
      where: { authId },
      data: {
        ...data,
        houseNumber: undefined, // remove DTO-only fields
        societyName: undefined,
        landmark: undefined,
        roadName: undefined,
      },
    });

    // Invalidate caches on profile update
    this.cache.invalidate(`profile:${authId}`);
    this.cache.invalidate(`auth:getMe:${authId}`);

    return { success: true, message: 'Profile updated', data: updated };
  }

  async updateAvatar(authId: string, avatarUrl: string) {
    await this.prisma.userProfile.update({
      where: { authId },
      data: { avatarUrl },
    });
    return { success: true, data: { avatarUrl } };
  }

  async savePaymentDetails(authId: string, dto: PaymentDetailsDto) {
    const profileData = await this.prisma.userProfile.findUnique({
      where: { authId },
    });
    if (!profileData) throw new NotFoundException('Profile not found');

    await this.prisma.payment.upsert({
      where: { authId },
      update: { upiId: dto.upiId },
      create: {
        authId,
        role: Role.USER,
        upiId: dto.upiId,
        userProfileId: profileData.id,
      },
    });
    return { success: true, message: 'Payment saved' };
  }
}
