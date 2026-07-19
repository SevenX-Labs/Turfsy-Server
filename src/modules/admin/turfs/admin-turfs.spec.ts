import { Test, TestingModule } from '@nestjs/testing';
import { AdminTurfsController } from './admin-turfs.controller';
import { AdminTurfsService } from './admin-turfs.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';

describe('AdminTurfs', () => {
  let controller: AdminTurfsController;
  let service: AdminTurfsService;

  const mockPrisma = {
    turf: {
      count: jest.fn().mockResolvedValue(5),
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'turf1', name: 'Turf A', status: 'ACTIVE' }]),
      findUnique: jest.fn().mockResolvedValue({
        id: 'turf1',
        name: 'Turf A',
        status: 'ACTIVE',
        deletedAt: null,
      }),
      update: jest.fn().mockResolvedValue({ id: 'turf1', status: 'ACTIVE' }),
    },
    adminActionLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminTurfsController],
      providers: [
        AdminTurfsService,
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

    controller = module.get<AdminTurfsController>(AdminTurfsController);
    service = module.get<AdminTurfsService>(AdminTurfsService);
  });

  it('should list turfs', async () => {
    const res = await controller.getTurfs();
    expect(res.success).toBe(true);
    expect(res.data.turfs).toHaveLength(1);
  });

  it('should get turf details', async () => {
    const res = await controller.getTurfDetails('turf1');
    expect(res.success).toBe(true);
    expect(res.data.id).toBe('turf1');
  });

  it('should activate turf', async () => {
    const res = await controller.activateTurf('turf1', { adminId: 'admin1' }, {
      ip: '127.0.0.1',
    } as any);
    expect(res.success).toBe(true);
  });

  it('should deactivate turf', async () => {
    const res = await controller.deactivateTurf(
      'turf1',
      { adminId: 'admin1' },
      { ip: '127.0.0.1' } as any,
    );
    expect(res.success).toBe(true);
  });

  it('should suspend turf', async () => {
    const res = await controller.suspendTurf(
      'turf1',
      { reason: 'guidelines' },
      { adminId: 'admin1' },
      { ip: '127.0.0.1' } as any,
    );
    expect(res.success).toBe(true);
  });

  it('should feature turf', async () => {
    const res = await controller.featureTurf('turf1', { adminId: 'admin1' }, {
      ip: '127.0.0.1',
    } as any);
    expect(res.success).toBe(true);
  });

  it('should unfeature turf', async () => {
    const res = await controller.unfeatureTurf('turf1', { adminId: 'admin1' }, {
      ip: '127.0.0.1',
    } as any);
    expect(res.success).toBe(true);
  });
});
