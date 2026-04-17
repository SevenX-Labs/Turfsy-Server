import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserProfileModule } from './modules/user-profile/user-profile.module';
import { OwnerProfileModule } from './modules/owner-profile/owner-profile.module';
import { TurfsModule } from './modules/turfs/turfs.module';
import { UploadModule } from './modules/upload/upload.module';
import { UserHomeModule } from './modules/user-home/user-home.module';
import { SavedTurfsModule } from './modules/saved-turfs/saved-turfs.module';
import { BookingModule } from './modules/booking/booking.module';
import { OwnerHomeModule } from './modules/owner-home/owner-home.module';
import { OwnerAnalyticsModule } from './modules/owner-analytics/owner-analytics.module';
import { OwnerSettingsModule } from './modules/owner-settings/owner-settings.module';
import { UserGamificationModule } from './modules/user-gamification/user-gamification.module';
import { UserSettingsModule } from './modules/user-settings/user-settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AuthModule,
    UserProfileModule,
    OwnerProfileModule,
    TurfsModule,
    UploadModule,
    UserHomeModule,
    SavedTurfsModule,
    BookingModule,
    OwnerHomeModule,
    OwnerAnalyticsModule,
    OwnerSettingsModule,
    UserGamificationModule,
    UserSettingsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
