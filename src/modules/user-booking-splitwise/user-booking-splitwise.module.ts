import { Module } from '@nestjs/common';
import { UserBookingSplitwiseService } from './user-booking-splitwise.service';
import { UserBookingSplitwiseController } from './user-booking-splitwise.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RateLimiterService } from '../../common/services/rate-limiter.service';
import { PaymentLoggerService } from '../../common/services/payment-logger.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [UserBookingSplitwiseController],
  providers: [
    UserBookingSplitwiseService,
    RateLimiterService,
    PaymentLoggerService,
  ],
  exports: [UserBookingSplitwiseService],
})
export class UserBookingSplitwiseModule {}
