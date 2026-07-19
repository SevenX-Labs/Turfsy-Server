import { Test, TestingModule } from '@nestjs/testing';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';

describe('AdminUsers', () => {
  let controller: AdminUsersController;
  let service: AdminUsersService;

  const mockPrisma = {
    auth: {
      count: jest.fn().mockResolvedValue(5),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'user1',
          phone: '+911234567890',
          isBanned: false,
          userProfile: { name: 'Test' },
        },
      ]),
      findUnique: jest.fn().mockResolvedValue({
        id: 'user1',
        phone: '+911234567890',
        role: 'USER',
        isBanned: false,
        userProfile: { name: 'Test', email: 'test@test.com' },
      }),
      findFirst: jest.fn().mockResolvedValue({ id: 'user1', role: 'USER' }),
      update: jest.fn().mockResolvedValue({ id: 'user1', isBanned: true }),
    },
    booking: {
      findMany: jest.fn().mockResolvedValue([
        { amount: 500, bookingStatus: 'CONFIRMED' },
        { amount: 300, bookingStatus: 'COMPLETED' },
      ]),
    },
    adminActionLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: mockPrisma },
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

    controller = module.get<AdminUsersController>(AdminUsersController);
    service = module.get<AdminUsersService>(AdminUsersService);
  });

  it('should list users', async () => {
    const res = await controller.getUsers();
    expect(res.success).toBe(true);
    expect(res.data.users).toHaveLength(1);
  });

  it('should get user details', async () => {
    const res = await controller.getUserDetails('user1');
    expect(res.success).toBe(true);
    expect(res.data.profile.id).toBe('user1');
    expect(res.data.totalBookings).toBe(2);
    expect(res.data.totalSpent).toBe(800);
  });

  it('should suspend user', async () => {
    const res = await controller.suspendUser(
      'user1',
      { reason: 'spam' },
      { adminId: 'admin1' },
      { ip: '127.0.0.1' } as any,
    );
    expect(res.success).toBe(true);
  });

  it('should activate user', async () => {
    const res = await controller.activateUser('user1', { adminId: 'admin1' }, {
      ip: '127.0.0.1',
    } as any);
    expect(res.success).toBe(true);
  });

  it('should soft delete user', async () => {
    const res = await controller.deleteUser('user1', { adminId: 'admin1' }, {
      ip: '127.0.0.1',
    } as any);
    expect(res.success).toBe(true);
  });

  it('should export users to csv', async () => {
    const csv = await service.exportUsersCsv();
    expect(csv).toContain('user1');
  });

  it('should export users to pdf buffer', async () => {
    const buffer = await service.exportUsersPdf();
    expect(buffer).toBeDefined();
  });
});
