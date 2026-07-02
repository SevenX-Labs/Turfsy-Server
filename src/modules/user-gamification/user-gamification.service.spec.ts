import { Test, TestingModule } from '@nestjs/testing';
import { UserGamificationService } from './user-gamification.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../common/notifications/notifications.service';

const mockPrisma = {
  booking: { findUnique: jest.fn() },
  userGamification: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

describe('UserGamificationService', () => {
  let service: UserGamificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserGamificationService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: NotificationsService,
          useValue: {
            sendNotification: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserGamificationService>(UserGamificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
