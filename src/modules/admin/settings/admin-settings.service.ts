import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AdminSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    let config = await this.prisma.platformConfig.findFirst();
    if (!config) {
      config = await this.prisma.platformConfig.create({
        data: {
          platformFeePercent: 10,
          gstPercent: 18,
          minBookingAmount: 100,
          maxRefundDays: 7,
          cancellationAllowedHours: 2,
          cancellationRefundPercent: 75,
          maxBookingsPerUser: 5,
          maintenanceMode: false,
          bookingEnabled: true,
          registrationEnabled: true,
          bookingWindowDays: 90,
          termsUrl: 'https://turfsy.com/terms',
          privacyUrl: 'https://turfsy.com/privacy',
          contactEmail: 'support@turfsy.com',
          contactPhone: '+919999999999',
          notificationTemplates: {},
        },
      });
    }

    // Filter to return only allowed settings properties
    const filteredConfig = {
      id: config.id,
      maintenanceMode: config.maintenanceMode,
      bookingWindowDays: config.bookingWindowDays,
      termsUrl: config.termsUrl,
      privacyUrl: config.privacyUrl,
      contactEmail: config.contactEmail,
      contactPhone: config.contactPhone,
      notificationTemplates: config.notificationTemplates,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };

    return { success: true, data: filteredConfig };
  }

  async updateSettings(dto: any, adminId: string, ipAddress: string) {
    const current = await this.getSettings();
    const configId = current.data.id;

    // Filter properties to only update allowed ones
    const updateData: any = {};
    if (dto.maintenanceMode !== undefined)
      updateData.maintenanceMode = dto.maintenanceMode;
    if (dto.bookingWindowDays !== undefined)
      updateData.bookingWindowDays = dto.bookingWindowDays;
    if (dto.termsUrl !== undefined) updateData.termsUrl = dto.termsUrl;
    if (dto.privacyUrl !== undefined) updateData.privacyUrl = dto.privacyUrl;
    if (dto.contactEmail !== undefined)
      updateData.contactEmail = dto.contactEmail;
    if (dto.contactPhone !== undefined)
      updateData.contactPhone = dto.contactPhone;
    if (dto.notificationTemplates !== undefined)
      updateData.notificationTemplates = dto.notificationTemplates;

    const updated = await this.prisma.platformConfig.update({
      where: { id: configId },
      data: {
        ...updateData,
        updatedBy: adminId,
      },
    });

    await this.prisma.adminActionLog.create({
      data: {
        adminId,
        action: 'SYSTEM_CONFIG_CHANGED',
        targetType: 'PlatformConfig',
        targetId: configId,
        reason: 'Configuration settings updated',
        ipAddress,
        metadata: updateData,
      },
    });

    const filteredConfig = {
      id: updated.id,
      maintenanceMode: updated.maintenanceMode,
      bookingWindowDays: updated.bookingWindowDays,
      termsUrl: updated.termsUrl,
      privacyUrl: updated.privacyUrl,
      contactEmail: updated.contactEmail,
      contactPhone: updated.contactPhone,
      notificationTemplates: updated.notificationTemplates,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    return { success: true, data: filteredConfig };
  }
}
