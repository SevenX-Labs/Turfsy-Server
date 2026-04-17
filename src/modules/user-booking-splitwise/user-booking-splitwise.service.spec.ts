import { Test, TestingModule } from '@nestjs/testing';
import { UserBookingSplitwiseService } from './user-booking-splitwise.service';

describe('UserBookingSplitwiseService', () => {
  let service: UserBookingSplitwiseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserBookingSplitwiseService],
    }).compile();

    service = module.get<UserBookingSplitwiseService>(UserBookingSplitwiseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
