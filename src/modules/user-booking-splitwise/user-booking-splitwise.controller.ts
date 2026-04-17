import { Controller } from '@nestjs/common';
import { UserBookingSplitwiseService } from './user-booking-splitwise.service';

@Controller('user-booking-splitwise')
export class UserBookingSplitwiseController {
  constructor(private readonly userBookingSplitwiseService: UserBookingSplitwiseService) {}
}
