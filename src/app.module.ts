import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import * as crypto from 'crypto';
import { MetricsModule } from './common/metrics/metrics.module';
import { HttpMetricsInterceptor } from './common/interceptors/http-metrics.interceptor';
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
import { UserBookingSplitwiseModule } from './modules/user-booking-splitwise/user-booking-splitwise.module';
import { NotificationsModule } from './common/notifications/notifications.module';
import { EmailModule } from './common/email/email.module';
import { RedisModule } from './common/redis/redis.module';
import { BullMqModule } from './common/bullmq/bullmq.module';
import { SentryModule } from '@sentry/nestjs/setup';
import { PlatformFeeSlabModule } from './modules/platform-fee-slab/platform-fee-slab.module';
import { AdminModule } from './modules/admin/admin.module';
import { OwnerSettlementsModule } from './modules/owner-settlements/owner-settlements.module';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req, res) => {
          const reqId = req.headers['x-request-id'] || crypto.randomUUID();
          res.setHeader('x-request-id', reqId);
          return reqId;
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-cron-secret"]',
            'req.body.otp',
            'req.body.password',
            'req.body.accessToken',
            'req.body.token',
            'req.body.refreshToken',
            'req.body.sessionToken',
            'req.body.paymentSecret',
            'req.body.secret',
            'req.body.checkInPin',
            'req.body.razorpaySignature',
            'res.headers["set-cookie"]',
          ],
          censor: '[REDACTED]',
        },
        autoLogging: true,
      },
    }),
    // ── Per-route throttling tiers ──
    // Named throttlers: "strict" for auth/OTP, "medium" for booking/payment, "default" for general
    ThrottlerModule.forRoot([
      {
        name: 'strict',
        ttl: 60000, // 1 minute
        limit: 5, // 5 req/min — auth/OTP endpoints
      },
      {
        name: 'medium',
        ttl: 60000, // 1 minute
        limit: 20, // 20 req/min — booking/payment endpoints
      },
      {
        name: 'default',
        ttl: 60000, // 1 minute
        limit: 60, // 60 req/min — general endpoints
      },
    ]),
    ScheduleModule.forRoot(),
    MetricsModule,
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
    OwnerSettlementsModule,
    UserGamificationModule,
    UserSettingsModule,
    UserBookingSplitwiseModule,
    NotificationsModule,
    EmailModule,
    RedisModule,
    BullMqModule,
    PlatformFeeSlabModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class AppModule {}
