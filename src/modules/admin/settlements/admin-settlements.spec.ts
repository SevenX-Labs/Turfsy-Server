import { Test, TestingModule } from '@nestjs/testing';
import { AdminSettlementsController } from './admin-settlements.controller';
import { AdminSettlementsService } from './admin-settlements.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';

describe('AdminSettlements', () => {
  let controller: AdminSettlementsController;
  let service: AdminSettlementsService;

  const mockPrisma = {
    settlement: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([
        { id: 's1', amount: 5000, status: 'PENDING', ownerProfileId: 'o1' },
      ]),
      findUnique: jest.fn().mockResolvedValue({
        id: 's1',
        amount: 5000,
        status: 'PENDING',
        ownerProfileId: 'o1',
        paidAt: null,
      }),
      create: jest.fn().mockResolvedValue({ id: 's1', status: 'PENDING' }),
      update: jest.fn().mockResolvedValue({ id: 's1', status: 'COMPLETED' }),
    },
    ownerProfile: {
      findUnique: jest.fn().mockResolvedValue({ id: 'o1', name: 'Owner A' }),
    },
    adminActionLog: {
      findFirst: jest.fn().mockResolvedValue({
        admin: { name: 'Admin One', email: 'admin@test.com' },
      }),
      create: jest.fn().mockResolvedValue({}),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminSettlementsController],
      providers: [
        AdminSettlementsService,
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

    controller = module.get<AdminSettlementsController>(AdminSettlementsController);
    service = module.get<AdminSettlementsService>(AdminSettlementsService);
  });

  it('should list settlements', async () => {
    const res = await controller.getSettlements();
    expect(res.success).toBe(true);
    expect(res.data.settlements).toHaveLength(1);
  });

  it('should get owner settlements', async () => {
    const res = await controller.getOwnerSettlements('o1');
    expect(res.success).toBe(true);
  });

  it('should get settlement details', async () => {
    const res = await controller.getSettlementDetails('s1');
    expect(res.success).toBe(true);
    expect(res.data.amount).toBe(5000);
    expect(res.data.paidByAdmin.name).toBe('Admin One');
  });

  it('should create settlement', async () => {
    const res = await controller.createSettlement({ ownerProfileId: 'o1', amount: 5000 });
    expect(res.success).toBe(true);
  });

  it('should mark paid', async () => {
    const res = await controller.markPaid('s1', { txRef: 'UTR123' }, { adminId: 'admin1' }, { ip: '127.0.0.1' } as any);
    expect(res.success).toBe(true);
  });

  it('should export settlements to csv', async () => {
    const csv = await service.exportSettlementsCsv();
    expect(csv).toContain('s1');
  });

  it('should export settlements to pdf buffer', async () => {
    const buffer = await service.exportSettlementsPdf();
    expect(buffer).toBeDefined();
  });
});
