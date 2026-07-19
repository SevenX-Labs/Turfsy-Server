import { Test, TestingModule } from '@nestjs/testing';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminNotificationsService } from './admin-notifications.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../../common/notifications/notifications.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';

describe('AdminNotifications', () => {
  let controller: AdminNotificationsController;
  let service: AdminNotificationsService;

  const mockPrisma = {
    auth: {
      findMany: jest.fn().mockResolvedValue([{ id: 'user1' }]),
    },
    notificationLog: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'log1',
          title: 'test',
          body: 'msg',
          targetType: 'ALL_USERS',
          sentBy: 'admin1',
          sentCount: 1,
          createdAt: new Date(),
        },
      ]),
      create: jest.fn().mockResolvedValue({}),
    },
    admin: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'admin1', name: 'Admin Name', email: 'admin@test.com' },
        ]),
    },
    adminActionLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  const mockNotificationsService = {
    sendNotification: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminNotificationsController],
      providers: [
        AdminNotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotificationsService },
        {
          provide: JwtService,
          useValue: { verify: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    })
      .overrideGuard(JwtAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminNotificationsController>(
      AdminNotificationsController,
    );
    service = module.get<AdminNotificationsService>(AdminNotificationsService);
  });

  it('should broadcast notification', async () => {
    const res = await controller.broadcast(
      { target: 'ALL_USERS', title: 'hello', body: 'world' },
      { adminId: 'admin1' },
      { ip: '127.0.0.1' } as any,
    );
    expect(res.success).toBe(true);
  });

  it('should get history', async () => {
    const res = await controller.getHistory(1, 10);
    expect(res.success).toBe(true);
    expect(res.data.history).toHaveLength(1);
    expect(res.data.history[0].sentBy).toBe('Admin Name (admin@test.com)');
  });
});
