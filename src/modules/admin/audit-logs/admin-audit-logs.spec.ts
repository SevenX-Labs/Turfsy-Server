import { Test, TestingModule } from '@nestjs/testing';
import { AdminAuditLogsController } from './admin-audit-logs.controller';
import { AdminAuditLogsService } from './admin-audit-logs.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';

describe('AdminAuditLogs', () => {
  let controller: AdminAuditLogsController;
  let service: AdminAuditLogsService;

  const mockPrisma = {
    adminActionLog: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'log1',
          action: 'USER_BANNED',
          targetType: 'User',
          targetId: 'user1',
          admin: { name: 'Admin A', email: 'admin@test.com' },
          createdAt: new Date(),
        },
      ]),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAuditLogsController],
      providers: [
        AdminAuditLogsService,
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

    controller = module.get<AdminAuditLogsController>(AdminAuditLogsController);
    service = module.get<AdminAuditLogsService>(AdminAuditLogsService);
  });

  it('should list and filter audit logs', async () => {
    const res = await controller.getLogs(
      'search',
      'USER_BANNED',
      'admin123',
      '2026-06-01',
      '2026-06-30',
      1,
      10,
    );
    expect(res.success).toBe(true);
    expect(res.data.logs).toHaveLength(1);
    expect(res.data.logs[0].action).toBe('USER_BANNED');
  });
});
