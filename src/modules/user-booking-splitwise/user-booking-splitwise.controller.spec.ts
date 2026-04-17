import { Test, TestingModule } from '@nestjs/testing';
import { UserBookingSplitwiseController } from './user-booking-splitwise.controller';
import { UserBookingSplitwiseService } from './user-booking-splitwise.service';

describe('UserBookingSplitwiseController', () => {
  let controller: UserBookingSplitwiseController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserBookingSplitwiseController],
      providers: [UserBookingSplitwiseService],
    }).compile();

    controller = module.get<UserBookingSplitwiseController>(UserBookingSplitwiseController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
