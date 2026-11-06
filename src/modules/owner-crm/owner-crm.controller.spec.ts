import { Test, TestingModule } from '@nestjs/testing';
import { OwnerCrmController } from './owner-crm.controller';
import { OwnerCrmService } from './owner-crm.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

describe('OwnerCrmController', () => {
  let controller: OwnerCrmController;
  let service: any;

  const mockOwnerCrmService = {
    broadcastOffer: jest.fn(),
    getAudienceCount: jest.fn(),
    getBroadcastHistory: jest.fn(),
  };

  const mockUserReq = {
    user: {
      authId: 'auth-owner-1',
      role: 'OWNER',
    },
  };

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [OwnerCrmController],
      providers: [
        { provide: OwnerCrmService, useValue: mockOwnerCrmService },
      ],
    });

    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({
      canActivate: jest.fn().mockResolvedValue(true),
    });
    moduleBuilder.overrideGuard(RolesGuard).useValue({
      canActivate: jest.fn().mockResolvedValue(true),
    });

    const module: TestingModule = await moduleBuilder.compile();
    controller = module.get<OwnerCrmController>(OwnerCrmController);
    service = module.get<OwnerCrmService>(OwnerCrmService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('broadcastOffer', () => {
    it('calls ownerCrmService.broadcastOffer with authId and dto', async () => {
      const dto = {
        turfId: 'turf-1',
        title: '⚡ Weekend Flash Sale',
        message: 'Get 25% off all morning slots this Sunday!',
        offerCode: 'SUN25',
      };

      const expectedResponse = {
        success: true,
        broadcastId: 'bcast-123',
        recipientsCount: 40,
        enqueued: false,
        message: 'Offer broadcast successfully dispatched to 40 customers',
      };

      mockOwnerCrmService.broadcastOffer.mockResolvedValue(expectedResponse);

      const result = await controller.broadcastOffer(mockUserReq, dto);

      expect(service.broadcastOffer).toHaveBeenCalledWith('auth-owner-1', dto);
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('getAudienceCount', () => {
    it('calls ownerCrmService.getAudienceCount with authId and turfId', async () => {
      const query = { turfId: 'turf-1' };
      const expectedResponse = {
        success: true,
        turfId: 'turf-1',
        targetTurfNames: ['Turfzy Arena'],
        audienceCount: 75,
        totalPastBookings: 120,
      };

      mockOwnerCrmService.getAudienceCount.mockResolvedValue(expectedResponse);

      const result = await controller.getAudienceCount(mockUserReq, query);

      expect(service.getAudienceCount).toHaveBeenCalledWith('auth-owner-1', 'turf-1');
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('getBroadcastHistory', () => {
    it('calls ownerCrmService.getBroadcastHistory with authId and query dto', async () => {
      const query = { turfId: 'turf-1', page: 1, limit: 10 };
      const expectedResponse = {
        success: true,
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      };

      mockOwnerCrmService.getBroadcastHistory.mockResolvedValue(expectedResponse);

      const result = await controller.getBroadcastHistory(mockUserReq, query);

      expect(service.getBroadcastHistory).toHaveBeenCalledWith('auth-owner-1', query);
      expect(result).toEqual(expectedResponse);
    });
  });
});

