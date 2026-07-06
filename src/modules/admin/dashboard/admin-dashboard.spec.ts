import { Test, TestingModule } from '@nestjs/testing';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';

describe('AdminDashboard', () => {
  let controller: AdminDashboardController;
  let service: AdminDashboardService;

  const mockPrisma = {
    auth: { count: jest.fn().mockResolvedValue(10) },
    turf: { count: jest.fn().mockResolvedValue(5) },
    booking: {
      count: jest.fn().mockResolvedValue(12),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { amount: 5000, platformFee: 500 },
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    settlement: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { amount: 1500 },
      }),
    },
    supportTicket: { count: jest.fn().mockResolvedValue(2) },
    adminActionLog: { findMany: jest.fn().mockResolvedValue([]) },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminDashboardController],
      providers: [
        AdminDashboardService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: JwtService,
          useValue: { verify: jest.fn().mockReturnValue({ adminId: 'admin123' }) },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('your_access_secret_2709') },
        },
      ],
    })
    .overrideGuard(JwtAdminGuard)
    .useValue({ canActivate: () => true })
    .compile();

    controller = module.get<AdminDashboardController>(AdminDashboardController);
    service = module.get<AdminDashboardService>(AdminDashboardService);
  });

  it('should get dashboard stats', async () => {
    const res = await controller.getDashboard();
    expect(res.success).toBe(true);
    expect(res.data.stats.totalUsers).toBe(10);
  });

  it('should get revenue stats', async () => {
    const res = await controller.getRevenueStats();
    expect(res.success).toBe(true);
    expect(res.data.todayRevenue).toBe(5000);
    expect(res.data.pendingSettlementAmount).toBe(1500);
  });

  it('should get chart data', async () => {
    const res = await controller.getChartData();
    expect(res.success).toBe(true);
    expect(res.data.bookingChart).toBeDefined();
    expect(res.data.revenueChart).toBeDefined();
  });

  it('should get recent bookings', async () => {
    const res = await controller.getRecentBookings(1, 10);
    expect(res.success).toBe(true);
    expect(res.data.bookings).toBeDefined();
  });
});
