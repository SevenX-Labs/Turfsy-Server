import { Module, OnModuleInit } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformFeeSlabModule } from '../platform-fee-slab/platform-fee-slab.module';
import { NotificationsModule } from '../../common/notifications/notifications.module';
import * as bcrypt from 'bcrypt';

// Auth
import { AdminAuthController } from './auth/admin-auth.controller';
import { AdminAuthService } from './auth/admin-auth.service';
import { JwtAdminGuard } from './auth/guards/jwt-admin.guard';

// Dashboard
import { AdminDashboardController } from './dashboard/admin-dashboard.controller';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';

// Users
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';

// Owners
import { AdminOwnersController } from './owners/admin-owners.controller';
import { AdminOwnersService } from './owners/admin-owners.service';

// Turfs
import { AdminTurfsController } from './turfs/admin-turfs.controller';
import { AdminTurfsService } from './turfs/admin-turfs.service';

// Bookings
import { AdminBookingsController } from './bookings/admin-bookings.controller';
import { AdminBookingsService } from './bookings/admin-bookings.service';

// Settlements
import { AdminSettlementsController } from './settlements/admin-settlements.controller';
import { AdminSettlementsService } from './settlements/admin-settlements.service';

// Analytics
import { AdminAnalyticsController } from './analytics/admin-analytics.controller';
import { AdminAnalyticsService } from './analytics/admin-analytics.service';

// Platform Fee Slabs
import { AdminPlatformFeeSlabsController } from './platform-fee-slabs/admin-platform-fee-slabs.controller';

// Notifications
import { AdminNotificationsController } from './notifications/admin-notifications.controller';
import { AdminNotificationsService } from './notifications/admin-notifications.service';

// Support
import { AdminSupportController } from './support/admin-support.controller';
import { AdminSupportService } from './support/admin-support.service';

// Settings
import { AdminSettingsController } from './settings/admin-settings.controller';
import { AdminSettingsService } from './settings/admin-settings.service';

// Audit Logs
import { AdminAuditLogsController } from './audit-logs/admin-audit-logs.controller';
import { AdminAuditLogsService } from './audit-logs/admin-audit-logs.service';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    PlatformFeeSlabModule,
    NotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET') || 'your_access_secret_2709',
        signOptions: {
          expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN', '24h') as any,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    AdminAuthController,
    AdminDashboardController,
    AdminUsersController,
    AdminOwnersController,
    AdminTurfsController,
    AdminBookingsController,
    AdminSettlementsController,
    AdminAnalyticsController,
    AdminPlatformFeeSlabsController,
    AdminNotificationsController,
    AdminSupportController,
    AdminSettingsController,
    AdminAuditLogsController,
  ],
  providers: [
    AdminAuthService,
    AdminDashboardService,
    AdminUsersService,
    AdminOwnersService,
    AdminTurfsService,
    AdminBookingsService,
    AdminSettlementsService,
    AdminAnalyticsService,
    AdminNotificationsService,
    AdminSupportService,
    AdminSettingsService,
    AdminAuditLogsService,
    JwtAdminGuard,
  ],
  exports: [
    AdminAuthService,
    JwtAdminGuard,
  ],
})
export class AdminModule implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD');

    if (!adminEmail || !adminPassword) {
      console.warn('ADMIN_EMAIL or ADMIN_PASSWORD not set in environment variables. Skipping Super Admin seeding.');
      return;
    }

    const trimmedEmail = adminEmail.toLowerCase().trim();

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    
    await this.prisma.admin.upsert({
      where: { email: trimmedEmail },
      update: {
        passwordHash,
        role: 'SUPER_ADMIN',
        isActive: true,
      },
      create: {
        email: trimmedEmail,
        passwordHash,
        name: 'Super Admin',
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    });
    console.log(`[SEED] Ensured SUPER_ADMIN exists and matches environment variables: ${trimmedEmail}`);
  }
}
