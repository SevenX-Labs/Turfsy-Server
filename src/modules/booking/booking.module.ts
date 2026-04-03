import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentLoggerService } from '../../common/services/payment-logger.service';
import { RateLimiterService } from '../../common/services/rate-limiter.service';

@Module({
  imports: [PrismaModule, AuthModule, ConfigModule],
  controllers: [BookingController],
  providers: [BookingService, PaymentLoggerService, RateLimiterService],
  exports: [BookingService],
})
export class BookingModule {}
