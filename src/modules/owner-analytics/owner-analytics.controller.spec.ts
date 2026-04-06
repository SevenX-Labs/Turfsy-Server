import { Test, TestingModule } from '@nestjs/testing';
import { OwnerAnalyticsController } from './owner-analytics.controller';
import { OwnerAnalyticsService } from './owner-analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

const mockOwnerAnalyticsService = {
  getOverallAnalytics: jest.fn(),
  getTotalRevenue: jest.fn(),
  getTotalBookings: jest.fn(),
  getCompletedBookings: jest.fn(),
  getCancelledBookings: jest.fn(),
  getRevenueByDate: jest.fn(),
  getBookingsByDate: jest.fn(),
  getCashVsOnline: jest.fn(),
  getPeakHours: jest.fn(),
  getCancellationRate: jest.fn(),
  getNoShowRate: jest.fn(),
};

describe('OwnerAnalyticsController', () => {
  let controller: OwnerAnalyticsController;

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [OwnerAnalyticsController],
      providers: [
        { provide: OwnerAnalyticsService, useValue: mockOwnerAnalyticsService },
      ],
    });

    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({
      canActivate: jest.fn().mockResolvedValue(true),
    });
    moduleBuilder.overrideGuard(RolesGuard).useValue({
      canActivate: jest.fn().mockResolvedValue(true),
    });

    const module: TestingModule = await moduleBuilder.compile();

    controller = module.get<OwnerAnalyticsController>(OwnerAnalyticsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
