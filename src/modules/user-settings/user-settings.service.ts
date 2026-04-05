import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UpdateUserPaymentSettingsDto } from './dto/payment-settings.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangePhoneDto } from './dto/change-phone.dto';
import { UpdateUserPreferencesDto } from './dto/preferences.dto';
import { UpdateUserNotificationSettingsDto } from './dto/notification-settings.dto';

@Injectable()
export class UserSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  private async ensureUser(authId: string) {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
    });
    if (!auth || !auth.isActive) {
      throw new NotFoundException('User account not found');
    }
    if (auth.role !== Role.USER) {
      throw new ForbiddenException('Only USER role can access user settings');
    }
    return auth;
  }

  private async getOrCreateUserSettings(authId: string) {
    return this.prisma.userSettings.upsert({
      where: { authId },
      update: {},
      create: { authId },
    });
  }

  async getPaymentSettings(authId: string) {
    await this.ensureUser(authId);

    const payment = await this.prisma.payment.findUnique({
      where: { authId },
    });

    return {
      success: true,
      data: {
        upiId: payment?.upiId ?? null,
        defaultPaymentMethod: payment?.payoutMethod ?? 'UPI',
      },
    };
  }

  async updatePaymentSettings(
    authId: string,
    dto: UpdateUserPaymentSettingsDto,
  ) {
    await this.ensureUser(authId);

    const profile = await this.prisma.userProfile.findUnique({
      where: { authId },
      select: { id: true },
    });

    const existing = await this.prisma.payment.findUnique({
      where: { authId },
    });

    const upiId = dto.upiId ?? existing?.upiId ?? '';
    if (!upiId) {
      throw new BadRequestException('upiId is required');
    }

    const payment = await this.prisma.payment.upsert({
      where: { authId },
      update: {
        upiId,
        ...(dto.defaultPaymentMethod !== undefined && {
          payoutMethod: dto.defaultPaymentMethod,
        }),
      },
      create: {
        authId,
        role: Role.USER,
        upiId,
        payoutMethod: dto.defaultPaymentMethod || 'UPI',
        userProfileId: profile?.id ?? null,
      },
    });

    return {
      success: true,
      message: 'Payment settings updated',
      data: {
        upiId: payment.upiId,
        defaultPaymentMethod: payment.payoutMethod,
      },
    };
  }

  async changePassword(authId: string, _dto: ChangePasswordDto) {
    await this.ensureUser(authId);

    return {
      success: true,
      message:
        'Password change is not applicable for OTP-based login. Use change-phone for login credential updates.',
    };
  }

  async changePhone(authId: string, dto: ChangePhoneDto) {
    await this.ensureUser(authId);

    if ((dto.otp && !dto.sessionToken) || (!dto.otp && dto.sessionToken)) {
      throw new BadRequestException(
        'Both otp and sessionToken are required for phone verification',
      );
    }

    if (dto.otp && dto.sessionToken) {
      return this.authService.verifyPhoneChange(
        authId,
        dto.sessionToken,
        dto.newPhone,
        dto.otp,
      );
    }

    return this.authService.requestPhoneChange(authId, dto.newPhone);
  }

  async getPreferences(authId: string) {
    await this.ensureUser(authId);
    const settings = await this.getOrCreateUserSettings(authId);

    return {
      success: true,
      data: {
        notificationsEnabled: settings.notificationsEnabled,
        preferredTime: settings.preferredTime,
        favoriteSport: settings.favoriteSport,
        favoriteTurfIds: settings.favoriteTurfIds,
      },
    };
  }

  async updatePreferences(authId: string, dto: UpdateUserPreferencesDto) {
    await this.ensureUser(authId);
    await this.getOrCreateUserSettings(authId);

    const updated = await this.prisma.userSettings.update({
      where: { authId },
      data: {
        ...(dto.notificationsEnabled !== undefined && {
          notificationsEnabled: dto.notificationsEnabled,
        }),
        ...(dto.preferredTime !== undefined && {
          preferredTime: dto.preferredTime,
        }),
        ...(dto.favoriteSport !== undefined && {
          favoriteSport: dto.favoriteSport,
        }),
        ...(dto.favoriteTurfIds !== undefined && {
          favoriteTurfIds: dto.favoriteTurfIds,
        }),
      },
    });

    return {
      success: true,
      message: 'Preferences updated',
      data: {
        notificationsEnabled: updated.notificationsEnabled,
        preferredTime: updated.preferredTime,
        favoriteSport: updated.favoriteSport,
        favoriteTurfIds: updated.favoriteTurfIds,
      },
    };
  }

  async getNotificationSettings(authId: string) {
    await this.ensureUser(authId);
    const settings = await this.getOrCreateUserSettings(authId);

    return {
      success: true,
      data: {
        bookingAlerts: settings.bookingAlerts,
        offerAlerts: settings.offerAlerts,
        reminderAlerts: settings.reminderAlerts,
      },
    };
  }

  async updateNotificationSettings(
    authId: string,
    dto: UpdateUserNotificationSettingsDto,
  ) {
    await this.ensureUser(authId);
    await this.getOrCreateUserSettings(authId);

    const updated = await this.prisma.userSettings.update({
      where: { authId },
      data: {
        ...(dto.bookingAlerts !== undefined && {
          bookingAlerts: dto.bookingAlerts,
        }),
        ...(dto.offerAlerts !== undefined && { offerAlerts: dto.offerAlerts }),
        ...(dto.reminderAlerts !== undefined && {
          reminderAlerts: dto.reminderAlerts,
        }),
      },
    });

    return {
      success: true,
      message: 'Notification settings updated',
      data: {
        bookingAlerts: updated.bookingAlerts,
        offerAlerts: updated.offerAlerts,
        reminderAlerts: updated.reminderAlerts,
      },
    };
  }
}
