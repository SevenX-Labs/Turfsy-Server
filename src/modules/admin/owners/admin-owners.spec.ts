import { Test, TestingModule } from '@nestjs/testing';
import { AdminOwnersController } from './admin-owners.controller';
import { AdminOwnersService } from './admin-owners.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';

describe('AdminOwners', () => {
  let controller: AdminOwnersController;
  let service: AdminOwnersService;

  const mockPrisma = {
    auth: {
      count: jest.fn().mockResolvedValue(2),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'owner1',
          phone: '+919999999999',
          isBanned: false,
          ownerProfile: {
            id: 'prof1',
            name: 'Owner Test',
            email: 'owner@test.com',
            _count: { turfs: 1 },
          },
        },
      ]),
      findUnique: jest.fn().mockResolvedValue({
        id: 'owner1',
        phone: '+919999999999',
        role: 'OWNER',
        isBanned: false,
        ownerProfile: {
          id: 'prof1',
          name: 'Owner Test',
          email: 'owner@test.com',
        },
      }),
      findFirst: jest.fn().mockResolvedValue({
        id: 'owner1',
        role: 'OWNER',
        ownerProfile: { id: 'prof1' },
      }),
      update: jest.fn().mockResolvedValue({ id: 'owner1', isBanned: true }),
    },
    payment: {
      findFirst: jest.fn().mockResolvedValue({ id: 'pay1', upiId: 'test@upi' }),
    },
    settlement: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'set1', amount: 1000, status: 'COMPLETED' }]),
    },
    turf: {
      count: jest.fn().mockResolvedValue(3),
    },
    booking: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { amount: 12000, platformFee: 1200 },
      }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(5),
    },
    turfRating: {
      aggregate: jest.fn().mockResolvedValue({
        _avg: { rating: 4.5 },
        _count: { rating: 10 },
      }),
    },
    adminActionLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminOwnersController],
      providers: [
        AdminOwnersService,
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

    controller = module.get<AdminOwnersController>(AdminOwnersController);
    service = module.get<AdminOwnersService>(AdminOwnersService);
  });

  it('should list owners', async () => {
    const res = await controller.getOwners();
    expect(res.success).toBe(true);
    expect(res.data.owners).toHaveLength(1);
  });

  it('should get owner details', async () => {
    const res = await controller.getOwnerDetails('owner1');
    expect(res.success).toBe(true);
    expect(res.data.turfCount).toBe(3);
    expect(res.data.rating.average).toBe(4.5);
    expect(res.data.activeBookings).toBe(5);
  });

  it('should suspend owner', async () => {
    const res = await controller.suspendOwner(
      'owner1',
      { reason: 'abuse' },
      { adminId: 'admin1' },
      { ip: '127.0.0.1' } as any,
    );
    expect(res.success).toBe(true);
  });

  it('should activate owner', async () => {
    const res = await controller.activateOwner(
      'owner1',
      { adminId: 'admin1' },
      { ip: '127.0.0.1' } as any,
    );
    expect(res.success).toBe(true);
  });

  it('should get bank details', async () => {
    const res = await controller.getBankDetails('owner1');
    expect(res.success).toBe(true);
    expect(res.data.upiId).toBe('test@upi');
  });

  it('should get settlement history', async () => {
    const res = await controller.getSettlementHistory('owner1');
    expect(res.success).toBe(true);
    expect(res.data).toHaveLength(1);
  });

  it('should export owners to csv', async () => {
    const csv = await service.exportOwnersCsv();
    expect(csv).toContain('owner1');
  });

  it('should export owners to pdf buffer', async () => {
    const buffer = await service.exportOwnersPdf();
    expect(buffer).toBeDefined();
  });
});
