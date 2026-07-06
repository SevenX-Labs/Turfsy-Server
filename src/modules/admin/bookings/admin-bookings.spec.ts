import { Test, TestingModule } from '@nestjs/testing';
import { AdminBookingsController } from './admin-bookings.controller';
import { AdminBookingsService } from './admin-bookings.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';

describe('AdminBookings', () => {
  let controller: AdminBookingsController;
  let service: AdminBookingsService;

  const mockPrisma = {
    booking: {
      count: jest.fn().mockResolvedValue(100),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'b1',
          amount: 800,
          bookingStatus: 'CONFIRMED',
          paymentStatus: 'PAID',
          bookingDate: new Date(),
          startTime: '10:00',
          endTime: '11:00',
          turf: { name: 'Turf A' },
          user: { phone: '+911234567890' }
        },
      ]),
      findUnique: jest.fn().mockResolvedValue({ id: 'b1', amount: 800 }),
      groupBy: jest.fn().mockResolvedValue([
        { bookingStatus: 'CONFIRMED', _count: { id: 10 } },
        { bookingStatus: 'COMPLETED', _count: { id: 85 } },
        { bookingStatus: 'CANCELLED', _count: { id: 5 } },
      ]),
      update: jest.fn().mockResolvedValue({ id: 'b1', bookingStatus: 'NO_SHOW' }),
    },
    adminActionLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminBookingsController],
      providers: [
        AdminBookingsService,
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

    controller = module.get<AdminBookingsController>(AdminBookingsController);
    service = module.get<AdminBookingsService>(AdminBookingsService);
  });

  it('should list bookings', async () => {
    const res = await controller.getBookings();
    expect(res.success).toBe(true);
    expect(res.data.bookings).toHaveLength(1);
  });

  it('should get stats', async () => {
    const res = await controller.getStats();
    expect(res.success).toBe(true);
    expect(res.data.CONFIRMED).toBe(10);
    expect(res.data.TOTAL).toBe(100);
  });

  it('should get booking details', async () => {
    const res = await controller.getBookingDetails('b1');
    expect(res.success).toBe(true);
  });

  it('should mark no-show', async () => {
    const res = await controller.markNoShow('b1', { adminId: 'admin1' }, { ip: '127.0.0.1' } as any);
    expect(res.success).toBe(true);
  });

  it('should export bookings to csv', async () => {
    const csv = await service.exportBookingsCsv({});
    expect(csv).toContain('b1');
  });

  it('should export bookings to pdf buffer', async () => {
    const buffer = await service.exportBookingsPdf({});
    expect(buffer).toBeDefined();
  });
});
