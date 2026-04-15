import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserProfileDto } from './dto/create-profile.dto';
import { UpdateUserProfileDto } from './dto/update-profile.dto';
import { PaymentDetailsDto } from './dto/payment-details.dto';
import { Role, SportsType } from '@prisma/client';

@Injectable()
export class UserProfileService {
  constructor(private readonly prisma: PrismaService) {}

  // Helper to format multiple manual fields into the single 'address' string
  private formatAddress(dto: any): string {
    const parts = [
      dto.houseNumber,
      dto.societyName,
      dto.landmark,
      dto.roadName
    ].filter(part => part && part.trim().length > 0);
    
    return parts.join(', ');
  }

  // Create profile - stores basic GPS info from Expo
  async createProfile(authId: string, dto: CreateUserProfileDto) {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
      include: { userProfile: true },
    });

    if (!auth) throw new NotFoundException('Account not found');
    if (!auth.isVerified) throw new ForbiddenException('Please verify phone number first');

    const profile = await this.prisma.userProfile.upsert({
      where: { authId },
      create: {
        authId,
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

    return { success: true, message: 'Profile created', data: profile };
  }

  // Get profile
  async getProfile(authId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { authId },
      include: { payment: true },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    return { success: true, data: profile };
  }

  // Update Address (Handles both GPS updates and Manual House/Society additions)
  async updateHomeAddress(authId: string, dto: UpdateUserProfileDto) {
    const profile = await this.prisma.userProfile.findUnique({ where: { authId } });
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

    const updated = await this.prisma.userProfile.update({
      where: { authId },
      data: {
        ...data,
        houseNumber: undefined, // remove DTO-only fields
        societyName: undefined,
        landmark: undefined,
        roadName: undefined,
      }
    });

    return { success: true, message: 'Profile updated', data: updated };
  }

  async updateAvatar(authId: string, avatarUrl: string) {
    await this.prisma.userProfile.update({ where: { authId }, data: { avatarUrl } });
    return { success: true, data: { avatarUrl } };
  }

  async savePaymentDetails(authId: string, dto: PaymentDetailsDto) {
    const profileData = await this.prisma.userProfile.findUnique({ where: { authId } });
    if (!profileData) throw new NotFoundException('Profile not found');

    await this.prisma.payment.upsert({
      where: { authId },
      update: { upiId: dto.upiId },
      create: { authId, role: Role.USER, upiId: dto.upiId, userProfileId: profileData.id },
    });
    return { success: true, message: 'Payment saved' };
  }
}
