import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileSettingsDto } from './dto/profile-settings.dto';
import { UpdateTurfSettingsDto } from './dto/turf-settings.dto';
import { UpdatePaymentSettingsDto } from './dto/payment-settings.dto';
import { UpdateNotificationSettingsDto } from './dto/notification-settings.dto';
import { UpdateCancellationPolicyDto } from './dto/cancellation-policy.dto';
import { PayoutMethod, Role } from '@prisma/client';

@Injectable()
export class OwnerSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureOwner(authId: string) {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
    });

    if (!auth || !auth.isActive) {
      throw new NotFoundException('Owner account not found');
    }

    if (auth.role !== Role.OWNER) {
      throw new ForbiddenException('Only OWNER role can access owner settings');
    }
  }

  private async getOrCreateOwnerSettings(authId: string) {
    return this.prisma.ownerSettings.upsert({
      where: { authId },
      update: {},
      create: { authId },
    });
  }

  async getProfileSettings(authId: string) {
    await this.ensureOwner(authId);

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
    await this.ensureOwner(authId);

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

  async getTurfSettings(ownerAuthId: string, turfId: string) {
    await this.ensureOwner(ownerAuthId);

    const turf = await this.prisma.turf.findUnique({
      where: { id: turfId },
      include: { owner: { select: { authId: true } } },
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

  async updateTurfSettings(
    ownerAuthId: string,
    turfId: string,
    dto: UpdateTurfSettingsDto,
  ) {
    await this.ensureOwner(ownerAuthId);

    const turf = await this.prisma.turf.findUnique({
      where: { id: turfId },
      include: { owner: { select: { authId: true } } },
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

  async getPaymentSettings(authId: string) {
    await this.ensureOwner(authId);
    const settings = await this.getOrCreateOwnerSettings(authId);

    return {
      success: true,
      data: {
        upiId: settings.upiId ?? null,
        bankAccount: settings.bankAccount ?? null,
        payoutMethod: settings.payoutMethod,
        payoutFrequency: settings.payoutFrequency,
        isActive: settings.payoutActive,
      },
    };
  }

  async updatePaymentSettings(authId: string, dto: UpdatePaymentSettingsDto) {
    await this.ensureOwner(authId);

    const ownerSettings = await this.getOrCreateOwnerSettings(authId);
    const resolvedPayoutMethod =
      dto.payoutMethod ?? ownerSettings.payoutMethod ?? PayoutMethod.UPI;
    const resolvedUpiId = dto.upiId ?? ownerSettings.upiId ?? '';
    const resolvedBankAccount = dto.bankAccount ?? ownerSettings.bankAccount;

    if (resolvedPayoutMethod === PayoutMethod.UPI && !resolvedUpiId) {
      throw new BadRequestException(
        'upiId is required when payoutMethod is UPI',
      );
    }

    if (resolvedPayoutMethod === PayoutMethod.BANK && !resolvedBankAccount) {
      throw new BadRequestException(
        'bankAccount is required when payoutMethod is BANK',
      );
    }

    const updatedOwnerSettings = await this.prisma.ownerSettings.update({
      where: { authId },
      data: {
        ...(dto.upiId !== undefined && { upiId: dto.upiId }),
        ...(dto.bankAccount !== undefined && { bankAccount: dto.bankAccount }),
        ...(dto.payoutMethod !== undefined && {
          payoutMethod: dto.payoutMethod,
        }),
        ...(dto.payoutFrequency !== undefined && {
          payoutFrequency: dto.payoutFrequency,
        }),
        ...(dto.isActive !== undefined && { payoutActive: dto.isActive }),
      },
    });

    return {
      success: true,
      message: 'Payment settings updated successfully',
      data: {
        upiId: updatedOwnerSettings.upiId,
        bankAccount: updatedOwnerSettings.bankAccount,
        payoutMethod: updatedOwnerSettings.payoutMethod,
        payoutFrequency: updatedOwnerSettings.payoutFrequency,
        isActive: updatedOwnerSettings.payoutActive,
      },
    };
  }

  async getNotificationSettings(authId: string) {
    await this.ensureOwner(authId);
    const settings = await this.getOrCreateOwnerSettings(authId);

    return {
      success: true,
      data: {
        bookingAlerts: settings.bookingAlerts,
        cancellationAlerts: settings.cancellationAlerts,
      },
    };
  }

  async updateNotificationSettings(
    authId: string,
    dto: UpdateNotificationSettingsDto,
  ) {
    await this.ensureOwner(authId);
    await this.getOrCreateOwnerSettings(authId);

    const updated = await this.prisma.ownerSettings.update({
      where: { authId },
      data: {
        ...(dto.bookingAlerts !== undefined && {
          bookingAlerts: dto.bookingAlerts,
        }),
        ...(dto.cancellationAlerts !== undefined && {
          cancellationAlerts: dto.cancellationAlerts,
        }),
      },
    });

    return {
      success: true,
      message: 'Notification settings updated successfully',
      data: {
        bookingAlerts: updated.bookingAlerts,
        cancellationAlerts: updated.cancellationAlerts,
      },
    };
  }

  async getCancellationPolicy(ownerAuthId: string, turfId: string) {
    await this.ensureOwner(ownerAuthId);

    const turf = await this.prisma.turf.findUnique({
      where: { id: turfId },
      include: { owner: { select: { authId: true } } },
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

  async updateCancellationPolicy(
    ownerAuthId: string,
    turfId: string,
    dto: UpdateCancellationPolicyDto,
  ) {
    await this.ensureOwner(ownerAuthId);

    const turf = await this.prisma.turf.findUnique({
      where: { id: turfId },
      include: { owner: { select: { authId: true } } },
    });

    if (!turf) throw new NotFoundException('Turf not found');
    if (turf.owner.authId !== ownerAuthId) {
      throw new ForbiddenException('You do not own this turf');
    }

    const updated = await this.prisma.turf.update({
      where: { id: turfId },
      data: {
        ...(dto.allowedBeforeHours !== undefined && {
          cancellationAllowedBeforeHours: dto.allowedBeforeHours,
        }),
        ...(dto.refundPercentage !== undefined && {
          cancellationRefundPercentage: dto.refundPercentage,
        }),
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

  async changePassword(authId: string) {
    await this.ensureOwner(authId);

    return {
      success: true,
      message:
        'Password change is not applicable for OTP-based login. Use secure phone change flow for credential updates.',
    };
  }

  async getSupportInfo(authId: string) {
    await this.ensureOwner(authId);

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
