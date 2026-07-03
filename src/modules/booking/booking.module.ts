import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentLoggerService } from '../../common/services/payment-logger.service';
import { RateLimiterService } from '../../common/services/rate-limiter.service';

import { UserGamificationModule } from '../user-gamification/user-gamification.module';
import { EmailModule } from '../../common/email/email.module';
import { NotificationsModule } from '../../common/notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ConfigModule,
    UserGamificationModule,
    EmailModule,
    NotificationsModule,
  ],
  controllers: [BookingController],
  providers: [BookingService, PaymentLoggerService, RateLimiterService],
  exports: [BookingService, PaymentLoggerService],
})
export class BookingModule {}
