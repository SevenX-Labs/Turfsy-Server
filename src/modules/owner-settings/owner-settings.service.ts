// Triggering IDE TS Server type cache refresh after schema update
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
import { UpdatePaymentSettingsDto, isSequential, isRepeatedPattern } from './dto/payment-settings.dto';
import { UpdateNotificationSettingsDto } from './dto/notification-settings.dto';
import { UpdateCancellationPolicyDto } from './dto/cancellation-policy.dto';
import { AccountType, Role } from '@prisma/client';

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
        bankHolderName: settings.bankHolderName ?? null,
        bankName: settings.bankName ?? null,
        accountNumber: settings.accountNumber ?? null,
        ifscCode: settings.ifscCode ?? null,
        accountType: settings.accountType ?? null,
      },
    };
  }

  async updatePaymentSettings(authId: string, dto: UpdatePaymentSettingsDto) {
    await this.ensureOwner(authId);

    // Reject null, undefined, empty, or whitespace-only inputs
    const requiredFields: (keyof UpdatePaymentSettingsDto)[] = [
      'bankHolderName',
      'bankName',
      'accountNumber',
      'confirmAccountNumber',
      'ifscCode',
      'accountType',
    ];

    for (const field of requiredFields) {
      const val = dto[field];
      if (val === null || val === undefined) {
        throw new BadRequestException(`${field} must not be null or undefined`);
      }
      if (typeof val === 'string' && val.trim() === '') {
        throw new BadRequestException(`${field} must not be empty or whitespace-only`);
      }
    }

    // Trim all inputs
    const bankHolderName = dto.bankHolderName.trim();
    const bankName = dto.bankName.trim();
    const accountNumber = dto.accountNumber.trim();
    const confirmAccountNumber = dto.confirmAccountNumber.trim();
    const ifscCode = dto.ifscCode.trim().toUpperCase();
    const accountType = dto.accountType;

    // Validate Account Holder Name
    if (bankHolderName.length < 3 || bankHolderName.length > 100) {
      throw new BadRequestException('Account holder name must be between 3 and 100 characters');
    }
    if (!/^[a-zA-Z\s.]+$/.test(bankHolderName)) {
      throw new BadRequestException('Account holder name can only contain alphabets, spaces, and dots');
    }

    // Validate Bank Name
    if (bankName.length < 3 || bankName.length > 100) {
      throw new BadRequestException('Bank name must be between 3 and 100 characters');
    }
    if (!/^[a-zA-Z\s&]+$/.test(bankName)) {
      throw new BadRequestException('Bank name can only contain alphabets, spaces, and &');
    }

    // Validate Account Number
    if (!/^\d+$/.test(accountNumber)) {
      throw new BadRequestException('Account number must contain digits only');
    }
    if (accountNumber.length < 9 || accountNumber.length > 18) {
      throw new BadRequestException('Account number must be between 9 and 18 digits');
    }
    if (accountNumber.startsWith('0')) {
      throw new BadRequestException('Account number must not start with 0');
    }
    if (new Set(accountNumber).size === 1) {
      throw new BadRequestException('Account number cannot consist of identical digits');
    }
    if (isSequential(accountNumber)) {
      throw new BadRequestException('Account number cannot be a sequential sequence');
    }
    if (isRepeatedPattern(accountNumber)) {
      throw new BadRequestException('Account number cannot contain repeated patterns');
    }

    // Validate Confirm Account Number
    if (accountNumber !== confirmAccountNumber) {
      throw new BadRequestException('Confirm account number must exactly match account number');
    }

    // Validate IFSC Code
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
      throw new BadRequestException('IFSC code must match the valid RBI IFSC format (e.g. HDFC0001234)');
    }

    // Validate Account Type
    if (accountType !== AccountType.SAVINGS && accountType !== AccountType.CURRENT) {
      throw new BadRequestException('Account type must be either SAVINGS or CURRENT');
    }

    const ownerSettings = await this.getOrCreateOwnerSettings(authId);
    const ownerProfile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
      select: { id: true },
    });

    const updatedOwnerSettings = await this.prisma.ownerSettings.update({
      where: { authId },
      data: {
        bankHolderName,
        bankName,
        accountNumber,
        ifscCode,
        accountType,
      },
    });

    await this.prisma.payment.upsert({
      where: { authId },
      update: {
        bankHolderName,
        bankName,
        accountNumber,
        ifscCode,
        accountType,
      },
      create: {
        authId,
        role: Role.OWNER,
        bankHolderName,
        bankName,
        accountNumber,
        ifscCode,
        accountType,
        ownerProfileId: ownerProfile?.id,
      },
    });

    return {
      success: true,
      message: 'Payment settings updated successfully',
      data: {
        bankHolderName: updatedOwnerSettings.bankHolderName,
        bankName: updatedOwnerSettings.bankName,
        accountNumber: updatedOwnerSettings.accountNumber,
        ifscCode: updatedOwnerSettings.ifscCode,
        accountType: updatedOwnerSettings.accountType,
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
