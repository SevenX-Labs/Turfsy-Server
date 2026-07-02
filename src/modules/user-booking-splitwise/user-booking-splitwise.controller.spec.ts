import { Test, TestingModule } from '@nestjs/testing';
import { UserBookingSplitwiseController } from './user-booking-splitwise.controller';
import { UserBookingSplitwiseService } from './user-booking-splitwise.service';

import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

describe('UserBookingSplitwiseController', () => {
  let controller: UserBookingSplitwiseController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserBookingSplitwiseController],
      providers: [
        {
          provide: UserBookingSplitwiseService,
          useValue: {},
        },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            auth: { findUnique: jest.fn() },
          },
        },
      ],
    }).compile();

    controller = module.get<UserBookingSplitwiseController>(UserBookingSplitwiseController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
