import { Test, TestingModule } from '@nestjs/testing';
import { OwnerHomeController } from './owner-home.controller';
import { OwnerHomeService } from './owner-home.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

const mockOwnerHomeService = {
  getDashboardStats: jest.fn(),
  getRevenueSummary: jest.fn(),
  getBookingStatistics: jest.fn(),
  getRecentActivity: jest.fn(),
  getTrends: jest.fn(),
  getPaymentDistribution: jest.fn(),
  getTurfPerformance: jest.fn(),
};

describe('OwnerHomeController', () => {
  let controller: OwnerHomeController;

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [OwnerHomeController],
      providers: [{ provide: OwnerHomeService, useValue: mockOwnerHomeService }],
    });

    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({
      canActivate: jest.fn().mockResolvedValue(true),
    });
    moduleBuilder.overrideGuard(RolesGuard).useValue({
      canActivate: jest.fn().mockResolvedValue(true),
    });

    const module: TestingModule = await moduleBuilder.compile();

    controller = module.get<OwnerHomeController>(OwnerHomeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
