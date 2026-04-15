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
import { CreateUserAddressDto } from './dto/create-address.dto';
import { PaymentDetailsDto } from './dto/payment-details.dto';
import { Role } from '@prisma/client';

@Injectable()
export class UserProfileService {
  constructor(private readonly prisma: PrismaService) {}

  // Create profile
  async createProfile(authId: string, dto: CreateUserProfileDto) {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
      include: { userProfile: true },
    });

    if (!auth) throw new NotFoundException('Account not found');
    if (!auth.isVerified)
      throw new ForbiddenException('Please verify your phone number first');

    const profile = await this.prisma.userProfile.upsert({
      where: { authId },
      create: {
        authId,
        name: dto.name,
        email: dto.email,
        dob: new Date(dto.dob),
        gender: dto.gender,
        preferredSport: dto.preferredSport ?? null,
      },
      update: {
        name: dto.name,
        email: dto.email,
        dob: new Date(dto.dob),
        gender: dto.gender,
        preferredSport: dto.preferredSport ?? null,
      },
    });

    return {
      success: true,
      message: 'Profile created successfully',
      data: profile,
    };
  }

  // Get own profile
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

  // Route 1: Update Home Address (Profile Main Address)
  async updateHomeAddress(authId: string, dto: UpdateUserProfileDto) {
    const profile = await this.prisma.userProfile.findUnique({ where: { authId } });
    if (!profile) throw new NotFoundException('Profile not found');

    const updated = await this.prisma.userProfile.update({
      where: { authId },
      data: {
        houseNumber: dto.houseNumber ?? undefined,
        societyName: dto.societyName ?? undefined,
        landmark: dto.landmark ?? undefined,
        roadName: dto.roadName ?? undefined,
        city: dto.city ?? undefined,
        state: dto.state ?? undefined,
        pincode: dto.pincode ?? undefined,
        currentLat: dto.currentLat ?? undefined,
        currentLng: dto.currentLng ?? undefined,
      },
    });

    return {
      success: true,
      message: 'Home address updated successfully',
      data: updated,
    };
  }

  // Route 2: Add New Location (Address List)
  async addNewLocation(authId: string, dto: CreateUserAddressDto) {
    // Note: If prisma.userAddress shows error, usually running 'npx prisma generate' fixes it.
    const address = await this.prisma.userAddress.create({
      data: {
        authId,
        label: dto.label || 'Other',
        houseNumber: dto.houseNumber || null,
        societyName: dto.societyName || null,
        landmark: dto.landmark || null,
        roadName: dto.roadName || null,
        city: dto.city,
        state: dto.state || null,
        pincode: dto.pincode,
        lat: dto.lat,
        lng: dto.lng,
        isDefault: dto.isDefault ?? false,
      },
    });

    return {
      success: true,
      message: 'New location added successfully',
      data: address,
    };
  }

  // Get saved addresses
  async getAddresses(authId: string) {
    const addresses = await this.prisma.userAddress.findMany({
      where: { authId },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: addresses };
  }

  // Delete saved address
  async deleteAddress(authId: string, addressId: string) {
    const address = await this.prisma.userAddress.findUnique({ where: { id: addressId } });
    if (!address || address.authId !== authId) throw new NotFoundException('Address not found');

    await this.prisma.userAddress.delete({ where: { id: addressId } });
    return { success: true, message: 'Address deleted' };
  }

  // Other methods
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
      create: { 
        authId, 
        role: Role.USER, 
        upiId: dto.upiId, 
        userProfileId: profileData.id 
      },
    });
    return { success: true, message: 'Payment saved' };
  }

  // Keep compatibility for any existing location calls but redirect to city
  async updateLocation(authId: string, lat: number, lng: number, city?: string) {
    await this.prisma.userProfile.update({
      where: { authId },
      data: { currentLat: lat, currentLng: lng, city },
    });
    return { success: true, data: { lat, lng, city } };
  }
}
