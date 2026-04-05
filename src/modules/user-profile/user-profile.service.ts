import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserProfileDto } from './dto/create-profile.dto';
import { UpdateUserProfileDto } from './dto/update-profile.dto';
import { PaymentDetailsDto } from './dto/payment-details.dto';
import { Role } from '@prisma/client';

@Injectable()
export class UserProfileService {
  constructor(private readonly prisma: PrismaService) {}

  // Create profile — only USER role, only if name is still empty
  async createProfile(authId: string, dto: CreateUserProfileDto) {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
      include: { userProfile: true },
    });

    if (!auth) throw new NotFoundException('Account not found');
    if (!auth.isVerified)
      throw new ForbiddenException('Please verify your phone number first');
    if (auth.role !== Role.USER)
      throw new ForbiddenException('Only USER role can create user profile');
    if (auth.userProfile?.name)
      throw new ConflictException('Profile already created');

    // Check email uniqueness
    const emailExists = await this.prisma.userProfile.findUnique({
      where: { email: dto.email },
    });
    if (emailExists) throw new ConflictException('Email already in use');

    const profile = await this.prisma.userProfile.update({
      where: { authId },
      data: {
        name: dto.name,
        email: dto.email,
        dob: new Date(dto.dob),
        gender: dto.gender,
        preferredSport: dto.preferredSport ?? null,
        currentLat: dto.currentLat ?? null,
        currentLng: dto.currentLng ?? null,
        currentCity: dto.currentCity ?? null,
      },
    });

    const userSettings =
      dto.preferredSport !== undefined
        ? await this.prisma.userSettings.upsert({
            where: { authId },
            update: { favoriteSport: dto.preferredSport },
            create: { authId, favoriteSport: dto.preferredSport },
          })
        : null;

    return {
      success: true,
      message: 'Profile created successfully',
      data: {
        ...profile,
        preferredSport: userSettings?.favoriteSport ?? profile.preferredSport,
      },
    };
  }

  // Get own profile with payment details
  async getProfile(authId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { authId },
      include: { payment: true },
    });

    if (!profile) throw new NotFoundException('Profile not found');

    return {
      success: true,
      data: profile,
    };
  }

  // Update profile — only owner of profile can update
  async updateProfile(authId: string, dto: UpdateUserProfileDto) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Profile not found');

    // Check email uniqueness if being changed
    if (dto.email && dto.email !== profile.email) {
      const emailExists = await this.prisma.userProfile.findUnique({
        where: { email: dto.email },
      });
      if (emailExists) throw new ConflictException('Email already in use');
    }

    const updated = await this.prisma.userProfile.update({
      where: { authId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.dob !== undefined && { dob: new Date(dto.dob) }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.preferredSport !== undefined && {
          preferredSport: dto.preferredSport,
        }),
        ...(dto.currentLat !== undefined && { currentLat: dto.currentLat }),
        ...(dto.currentLng !== undefined && { currentLng: dto.currentLng }),
        ...(dto.currentCity !== undefined && { currentCity: dto.currentCity }),
      },
    });

    if (dto.preferredSport !== undefined) {
      await this.prisma.userSettings.upsert({
        where: { authId },
        update: { favoriteSport: dto.preferredSport },
        create: { authId, favoriteSport: dto.preferredSport },
      });
    }

    return {
      success: true,
      message: 'Profile updated successfully',
      data: updated,
    };
  }

  // Update avatar URL
  async updateAvatar(authId: string, avatarUrl: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Profile not found');

    const updated = await this.prisma.userProfile.update({
      where: { authId },
      data: { avatarUrl },
    });

    return {
      success: true,
      message: 'Avatar updated successfully',
      data: { avatarUrl: updated.avatarUrl },
    };
  }

  // Save or update UPI payment details
  async savePaymentDetails(authId: string, dto: PaymentDetailsDto) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Profile not found');

    const payment = await this.prisma.payment.upsert({
      where: { authId },
      update: { upiId: dto.upiId },
      create: {
        authId,
        role: Role.USER,
        upiId: dto.upiId,
        userProfileId: profile.id,
      },
    });

    return {
      success: true,
      message: 'Payment details saved successfully',
      data: { upiId: payment.upiId },
    };
  }

  // Update location from expo-location
  async updateLocation(
    authId: string,
    lat: number,
    lng: number,
    city?: string,
  ) {
    if (!lat || !lng) throw new BadRequestException('lat and lng are required');

    const profile = await this.prisma.userProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Profile not found');

    await this.prisma.userProfile.update({
      where: { authId },
      data: {
        currentLat: lat,
        currentLng: lng,
        ...(city && { currentCity: city }),
      },
    });

    return {
      success: true,
      message: 'Location updated successfully',
      data: { lat, lng, city: city ?? null },
    };
  }
}
