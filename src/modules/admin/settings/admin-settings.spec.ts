import { Test, TestingModule } from '@nestjs/testing';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminSettingsService } from './admin-settings.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';

describe('AdminSettings', () => {
  let controller: AdminSettingsController;
  let service: AdminSettingsService;

  const mockPrisma = {
    platformConfig: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'cfg1',
        platformFeePercent: 10,
        bookingWindowDays: 90,
        maintenanceMode: false,
        contactEmail: 'support@turfsy.com',
      }),
      create: jest.fn().mockResolvedValue({
        id: 'cfg1',
        platformFeePercent: 10,
        bookingWindowDays: 90,
        maintenanceMode: false,
        contactEmail: 'support@turfsy.com',
      }),
      update: jest.fn().mockResolvedValue({
        id: 'cfg1',
        bookingWindowDays: 60,
        maintenanceMode: true,
      }),
    },
    adminActionLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminSettingsController],
      providers: [
        AdminSettingsService,
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

    controller = module.get<AdminSettingsController>(AdminSettingsController);
    service = module.get<AdminSettingsService>(AdminSettingsService);
  });

  it('should get settings and filter out platformFeePercent', async () => {
    const res = await controller.getSettings();
    expect(res.success).toBe(true);
    expect(res.data.bookingWindowDays).toBe(90);
    expect((res.data as any).platformFeePercent).toBeUndefined();
  });

  it('should update settings', async () => {
    const res = await controller.updateSettings(
      { bookingWindowDays: 60, maintenanceMode: true },
      { adminId: 'admin1' },
      { ip: '127.0.0.1' } as any,
    );
    expect(res.success).toBe(true);
    expect(res.data.bookingWindowDays).toBe(60);
  });
});
