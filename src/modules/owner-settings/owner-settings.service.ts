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
import { CreateMaintenanceDto, UpdateMaintenanceDto } from './dto/maintenance.dto';
import { AccountType, Role } from '@prisma/client';

export function maskAccountNumber(accNum: string | null | undefined): string | null {
  if (!accNum) return null;
  if (accNum.length <= 4) return '*'.repeat(accNum.length);
  const last4 = accNum.slice(-4);
  return '*'.repeat(accNum.length - 4) + last4;
}

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
        accountNumber: maskAccountNumber(settings.accountNumber),
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
    if (/[<>'";]|--/.test(bankHolderName)) {
      throw new BadRequestException('Account holder name cannot contain SQL/XSS special characters');
    }

    // Validate Bank Name
    if (bankName.length < 3 || bankName.length > 100) {
      throw new BadRequestException('Bank name must be between 3 and 100 characters');
    }
    if (!/^[a-zA-Z\s&]+$/.test(bankName)) {
      throw new BadRequestException('Bank name can only contain alphabets, spaces, and &');
    }
    if (/[<>'";]|--/.test(bankName)) {
      throw new BadRequestException('Bank name cannot contain SQL/XSS special characters');
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

  async getMaintenanceBlocks(ownerAuthId: string, turfId: string) {
    await this.ensureOwner(ownerAuthId);

    const turf = await this.prisma.turf.findFirst({
      where: { id: turfId, owner: { authId: ownerAuthId } },
    });
    if (!turf) {
      throw new ForbiddenException('You do not own this turf');
    }

    const records = await this.prisma.turfMaintenance.findMany({
      where: { turfId },
      orderBy: { startDate: 'asc' },
    });

    return {
      success: true,
      data: records,
    };
  }

  async createMaintenanceBlock(ownerAuthId: string, dto: CreateMaintenanceDto) {
    await this.ensureOwner(ownerAuthId);

    const turf = await this.prisma.turf.findFirst({
      where: { id: dto.turfId, owner: { authId: ownerAuthId } },
    });
    if (!turf) {
      throw new ForbiddenException('You do not own this turf');
    }

    const blocksToCreate: { startDate: Date; endDate: Date; reason?: string; createdBy: string; turfId: string }[] = [];

    if (dto.date) {
      const start = new Date(dto.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dto.date);
      end.setHours(23, 59, 59, 999);
      blocksToCreate.push({
        turfId: dto.turfId,
        startDate: start,
        endDate: end,
        reason: dto.reason,
        createdBy: ownerAuthId,
      });
    } else if (dto.dates && dto.dates.length > 0) {
      for (const d of dto.dates) {
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        const end = new Date(d);
        end.setHours(23, 59, 59, 999);
        blocksToCreate.push({
          turfId: dto.turfId,
          startDate: start,
          endDate: end,
          reason: dto.reason,
          createdBy: ownerAuthId,
        });
      }
    } else if (dto.startDate && dto.endDate) {
      const start = new Date(dto.startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dto.endDate);
      end.setHours(23, 59, 59, 999);

      if (start > end) {
        throw new BadRequestException('Start date cannot be after end date');
      }

      blocksToCreate.push({
        turfId: dto.turfId,
        startDate: start,
        endDate: end,
        reason: dto.reason,
        createdBy: ownerAuthId,
      });
    } else {
      throw new BadRequestException('Please provide either date, dates, or a startDate and endDate range');
    }

    // Overlap validation with existing bookings
    for (const block of blocksToCreate) {
      const conflicts = await this.prisma.booking.findFirst({
        where: {
          turfId: dto.turfId,
          bookingStatus: { in: ['CONFIRMED', 'PENDING_APPROVAL'] },
          bookingDate: {
            gte: block.startDate,
            lte: block.endDate,
          },
        },
      });

      if (conflicts) {
        throw new BadRequestException('Confirmed bookings already exist.');
      }
    }

    const createdRecords: any[] = [];
    for (const block of blocksToCreate) {
      const record = await this.prisma.turfMaintenance.create({
        data: {
          turfId: block.turfId,
          startDate: block.startDate,
          endDate: block.endDate,
          reason: block.reason,
          createdBy: block.createdBy,
        },
      });
      createdRecords.push(record);
    }

    return {
      success: true,
      message: 'Maintenance block created successfully',
      data: createdRecords,
    };
  }

  async updateMaintenanceBlock(ownerAuthId: string, maintenanceId: string, dto: UpdateMaintenanceDto) {
    await this.ensureOwner(ownerAuthId);

    const record = await this.prisma.turfMaintenance.findUnique({
      where: { id: maintenanceId },
      include: { turf: { include: { owner: { select: { authId: true } } } } },
    });

    if (!record) {
      throw new NotFoundException('Maintenance record not found');
    }

    if (record.turf.owner.authId !== ownerAuthId) {
      throw new ForbiddenException('You do not own this turf');
    }

    const start = new Date(dto.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dto.endDate);
    end.setHours(23, 59, 59, 999);

    if (start > end) {
      throw new BadRequestException('Start date cannot be after end date');
    }

    const conflicts = await this.prisma.booking.findFirst({
      where: {
        turfId: record.turfId,
        bookingStatus: { in: ['CONFIRMED', 'PENDING_APPROVAL'] },
        bookingDate: {
          gte: start,
          lte: end,
        },
      },
    });

    if (conflicts) {
      throw new BadRequestException('Confirmed bookings already exist.');
    }

    const updated = await this.prisma.turfMaintenance.update({
      where: { id: maintenanceId },
      data: {
        startDate: start,
        endDate: end,
        reason: dto.reason,
      },
    });

    return {
      success: true,
      message: 'Maintenance block updated successfully',
      data: updated,
    };
  }

  async deleteMaintenanceBlock(ownerAuthId: string, maintenanceId: string) {
    await this.ensureOwner(ownerAuthId);

    const record = await this.prisma.turfMaintenance.findUnique({
      where: { id: maintenanceId },
      include: { turf: { include: { owner: { select: { authId: true } } } } },
    });

    if (!record) {
      throw new NotFoundException('Maintenance record not found');
    }

    if (record.turf.owner.authId !== ownerAuthId) {
      throw new ForbiddenException('You do not own this turf');
    }

    await this.prisma.turfMaintenance.delete({
      where: { id: maintenanceId },
    });

    return {
      success: true,
      message: 'Maintenance block deleted successfully',
    };
  }
}
