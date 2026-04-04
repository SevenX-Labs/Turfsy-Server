import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileSettingsDto } from './dto/profile-settings.dto';
import { UpdateTurfSettingsDto } from './dto/turf-settings.dto';
import { UpdatePaymentSettingsDto } from './dto/payment-settings.dto';
import { UpdateNotificationSettingsDto } from './dto/notification-settings.dto';
import { UpdateCancellationPolicyDto } from './dto/cancellation-policy.dto';
import { Role } from '@prisma/client';

@Injectable()
export class OwnerSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Profile Settings
  async getProfileSettings(authId: string) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
      select: {
        name: true,
        email: true,
        contactNumber: true,
      },
    });

    if (!profile) throw new NotFoundException('Owner profile not found');

    return {
      success: true,
      data: profile,
    };
  }

  async updateProfileSettings(authId: string, dto: UpdateProfileSettingsDto) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Owner profile not found');

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
        ...(dto.name && { name: dto.name }),
        ...(dto.email && { email: dto.email }),
      },
      select: {
        name: true,
        email: true,
        contactNumber: true,
      },
    });

    return {
      success: true,
      message: 'Profile settings updated successfully',
      data: updated,
    };
  }

  // 2. Turf Management
  async getTurfSettings(ownerAuthId: string, turfId: string) {
    const turf = await this.prisma.turf.findUnique({
      where: { id: turfId },
      include: { owner: true },
    });

    if (!turf) throw new NotFoundException('Turf not found');
    if (turf.owner.authId !== ownerAuthId) {
      throw new ForbiddenException('You do not own this turf');
    }

    return {
      success: true,
      data: {
        id: turf.id,
        name: turf.name,
        description: turf.description,
        weekdayDayPrice: turf.weekdayDayPrice,
        weekdayNightPrice: turf.weekdayNightPrice,
        weekendDayPrice: turf.weekendDayPrice,
        weekendNightPrice: turf.weekendNightPrice,
        openTime: turf.openTime,
        closeTime: turf.closeTime,
        groundDayUrl: turf.groundDayUrl,
        groundNightUrl: turf.groundNightUrl,
        entranceUrl: turf.entranceUrl,
      },
    };
  }

  async updateTurfSettings(ownerAuthId: string, turfId: string, dto: UpdateTurfSettingsDto) {
    const turf = await this.prisma.turf.findUnique({
      where: { id: turfId },
      include: { owner: true },
    });

    if (!turf) throw new NotFoundException('Turf not found');
    if (turf.owner.authId !== ownerAuthId) {
      throw new ForbiddenException('You do not own this turf');
    }

    const updated = await this.prisma.turf.update({
      where: { id: turfId },
      data: {
        ...dto,
      },
    });

    return {
      success: true,
      message: 'Turf settings updated successfully',
      data: updated,
    };
  }

  // 3. Payment Settings
  async getPaymentSettings(authId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { authId },
    });

    return {
      success: true,
      data: {
        upiId: payment?.upiId || null,
        bankAccount: payment?.bankAccount || null,
        payoutMethod: payment?.payoutMethod || 'UPI',
        payoutFrequency: payment?.payoutFrequency || 'MANUAL',
        isActive: payment?.isActive ?? false,
      },
    };
  }

  async updatePaymentSettings(authId: string, dto: UpdatePaymentSettingsDto) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });
    if (!profile) throw new NotFoundException('Owner profile not found');

    const payment = await this.prisma.payment.upsert({
      where: { authId },
      update: {
        ...(dto.upiId !== undefined && { upiId: dto.upiId }),
        ...(dto.bankAccount !== undefined && { bankAccount: dto.bankAccount }),
        ...(dto.payoutMethod !== undefined && { payoutMethod: dto.payoutMethod }),
        ...(dto.payoutFrequency !== undefined && { payoutFrequency: dto.payoutFrequency }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      create: {
        authId,
        role: Role.OWNER,
        upiId: dto.upiId || '',
        bankAccount: dto.bankAccount,
        payoutMethod: dto.payoutMethod || 'UPI',
        payoutFrequency: dto.payoutFrequency || 'MANUAL',
        isActive: dto.isActive ?? true,
        ownerProfileId: profile.id,
      },
    });

    return {
      success: true,
      message: 'Payment settings updated successfully',
      data: payment,
    };
  }

  // 4. Notification Settings
  async getNotificationSettings(authId: string) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
      select: {
        bookingAlerts: true,
        cancellationAlerts: true,
      },
    });

    if (!profile) throw new NotFoundException('Owner profile not found');

    return {
      success: true,
      data: profile,
    };
  }

  async updateNotificationSettings(authId: string, dto: UpdateNotificationSettingsDto) {
    const updated = await this.prisma.ownerProfile.update({
      where: { authId },
      data: {
        ...(dto.bookingAlerts !== undefined && { bookingAlerts: dto.bookingAlerts }),
        ...(dto.cancellationAlerts !== undefined && { cancellationAlerts: dto.cancellationAlerts }),
      },
      select: {
        bookingAlerts: true,
        cancellationAlerts: true,
      },
    });

    return {
      success: true,
      message: 'Notification settings updated successfully',
      data: updated,
    };
  }

  // 5. Cancellation Policy
  async getCancellationPolicy(ownerAuthId: string, turfId: string) {
    const turf = await this.prisma.turf.findUnique({
      where: { id: turfId },
      include: { owner: true },
    });

    if (!turf) throw new NotFoundException('Turf not found');
    if (turf.owner.authId !== ownerAuthId) {
      throw new ForbiddenException('You do not own this turf');
    }

    return {
      success: true,
      data: {
        allowedBeforeHours: turf.cancellationAllowedBeforeHours,
        refundPercentage: turf.cancellationRefundPercentage,
      },
    };
  }

  async updateCancellationPolicy(ownerAuthId: string, turfId: string, dto: UpdateCancellationPolicyDto) {
    const turf = await this.prisma.turf.findUnique({
      where: { id: turfId },
      include: { owner: true },
    });

    if (!turf) throw new NotFoundException('Turf not found');
    if (turf.owner.authId !== ownerAuthId) {
      throw new ForbiddenException('You do not own this turf');
    }

    const updated = await this.prisma.turf.update({
      where: { id: turfId },
      data: {
        ...(dto.allowedBeforeHours !== undefined && { cancellationAllowedBeforeHours: dto.allowedBeforeHours }),
        ...(dto.refundPercentage !== undefined && { cancellationRefundPercentage: dto.refundPercentage }),
      },
    });

    return {
      success: true,
      message: 'Cancellation policy updated successfully',
      data: {
        allowedBeforeHours: updated.cancellationAllowedBeforeHours,
        refundPercentage: updated.cancellationRefundPercentage,
      },
    };
  }

  // 6. Support Info
  getSupportInfo() {
    return {
      success: true,
      data: {
        email: 'support@turfsy.com',
        phone: '+91 9999999999',
        whatsapp: '+91 9999999999',
        helpCenterUrl: 'https://help.turfsy.com',
      },
    };
  }
}
