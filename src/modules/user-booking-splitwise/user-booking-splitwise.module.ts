import { Module } from '@nestjs/common';
import { UserBookingSplitwiseService } from './user-booking-splitwise.service';
import { UserBookingSplitwiseController } from './user-booking-splitwise.controller';

@Module({
  controllers: [UserBookingSplitwiseController],
  providers: [UserBookingSplitwiseService],
})
export class UserBookingSplitwiseModule {}
