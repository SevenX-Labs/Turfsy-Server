import { Test, TestingModule } from '@nestjs/testing';
import { OwnerSettingsService } from './owner-settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, AccountType } from '@prisma/client';

describe('OwnerSettingsService', () => {
  let service: OwnerSettingsService;
  let prisma: PrismaService;

  const mockPrisma = {
    auth: { findUnique: jest.fn() },
    ownerSettings: { upsert: jest.fn(), update: jest.fn() },
    ownerProfile: { findUnique: jest.fn() },
    payment: { upsert: jest.fn() },
    turf: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    turfMaintenance: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    booking: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerSettingsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<OwnerSettingsService>(OwnerSettingsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updatePaymentSettings', () => {
    const validDto = {
      bankHolderName: 'John Doe',
      bankName: 'HDFC Bank',
      accountNumber: '50100234567890',
      confirmAccountNumber: '50100234567890',
      ifscCode: 'HDFC0001234',
      accountType: AccountType.SAVINGS,
    };

    beforeEach(() => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'owner-auth-id',
        role: Role.OWNER,
        isActive: true,
      });
      mockPrisma.ownerSettings.upsert.mockResolvedValue({
        id: 'settings-id',
      });
      mockPrisma.ownerProfile.findUnique.mockResolvedValue({
        id: 'profile-id',
      });
      mockPrisma.ownerSettings.update.mockResolvedValue({
        bankHolderName: 'John Doe',
        bankName: 'HDFC Bank',
        accountNumber: '50100234567890',
        ifscCode: 'HDFC0001234',
        accountType: AccountType.SAVINGS,
      });
      mockPrisma.payment.upsert.mockResolvedValue({});
    });

    it('should successfully save valid bank details', async () => {
      const result = await service.updatePaymentSettings('owner-auth-id', validDto);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Payment settings updated successfully');
      expect(result.data.bankHolderName).toBe('John Doe');
      expect(mockPrisma.ownerSettings.update).toHaveBeenCalled();
    });

    it('should reject missing or null/undefined fields', async () => {
      await expect(
        service.updatePaymentSettings('owner-auth-id', {
          ...validDto,
          bankHolderName: null as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject empty or whitespace-only strings', async () => {
      await expect(
        service.updatePaymentSettings('owner-auth-id', {
          ...validDto,
          bankName: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid Account Holder Name (special chars)', async () => {
      await expect(
        service.updatePaymentSettings('owner-auth-id', {
          ...validDto,
          bankHolderName: 'John Doe @123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid Bank Name (special chars)', async () => {
      await expect(
        service.updatePaymentSettings('owner-auth-id', {
          ...validDto,
          bankName: 'Bank-Of-India!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject Account Number containing non-digits', async () => {
      await expect(
        service.updatePaymentSettings('owner-auth-id', {
          ...validDto,
          accountNumber: '12345678A',
          confirmAccountNumber: '12345678A',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject Account Number starting with 0', async () => {
      await expect(
        service.updatePaymentSettings('owner-auth-id', {
          ...validDto,
          accountNumber: '0123456789',
          confirmAccountNumber: '0123456789',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject Account Number with identical digits', async () => {
      await expect(
        service.updatePaymentSettings('owner-auth-id', {
          ...validDto,
          accountNumber: '9999999999',
          confirmAccountNumber: '9999999999',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject Account Number with obvious sequential numbers', async () => {
      await expect(
        service.updatePaymentSettings('owner-auth-id', {
          ...validDto,
          accountNumber: '123456789',
          confirmAccountNumber: '123456789',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject Account Number with repeated patterns', async () => {
      await expect(
        service.updatePaymentSettings('owner-auth-id', {
          ...validDto,
          accountNumber: '1212121212',
          confirmAccountNumber: '1212121212',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject mismatched Confirm Account Number', async () => {
      await expect(
        service.updatePaymentSettings('owner-auth-id', {
          ...validDto,
          confirmAccountNumber: '9876543210123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid IFSC formats', async () => {
      await expect(
        service.updatePaymentSettings('owner-auth-id', {
          ...validDto,
          ifscCode: 'HDFC1123456', // 5th character must be 0
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid Account Types', async () => {
      await expect(
        service.updatePaymentSettings('owner-auth-id', {
          ...validDto,
          accountType: 'OTHER' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject SQL/XSS characters in Account Holder Name', async () => {
      await expect(
        service.updatePaymentSettings('owner-auth-id', {
          ...validDto,
          bankHolderName: 'John; DROP TABLE Users;--',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject SQL/XSS characters in Bank Name', async () => {
      await expect(
        service.updatePaymentSettings('owner-auth-id', {
          ...validDto,
          bankName: 'HDFC <script>alert(1)</script>',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getPaymentSettings', () => {
    it('should return masked account number', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'owner-auth-id',
        role: Role.OWNER,
        isActive: true,
      });
      mockPrisma.ownerSettings.upsert.mockResolvedValue({
        id: 'settings-id',
        bankHolderName: 'John Doe',
        bankName: 'HDFC Bank',
        accountNumber: '50100234567890',
        ifscCode: 'HDFC0001234',
        accountType: AccountType.SAVINGS,
      });

      const result = await service.getPaymentSettings('owner-auth-id');
      expect(result.success).toBe(true);
      expect(result.data.accountNumber).toBe('**********7890');
    });
  });

  describe('Turf Maintenance Blocks Management', () => {
    const dummyTurf = { id: 'turf-1', name: 'Super Turf', ownerProfileId: 'owner-id' };
    const mockAuthOwner = { id: 'owner-auth-id', role: Role.OWNER, isActive: true };

    beforeEach(() => {
      mockPrisma.auth.findUnique.mockResolvedValue(mockAuthOwner);
      mockPrisma.turf.findFirst.mockResolvedValue(dummyTurf);
      mockPrisma.booking.findFirst.mockResolvedValue(null);
    });

    it('should successfully create single date maintenance', async () => {
      mockPrisma.turfMaintenance.create.mockResolvedValue({ id: 'm-1' });

      const response = await service.createMaintenanceBlock('owner-auth-id', {
        turfId: 'turf-1',
        date: '2026-08-15',
        reason: 'Electrical Work',
      });

      expect(response.success).toBe(true);
      expect(mockPrisma.turfMaintenance.create).toHaveBeenCalled();
    });

    it('should successfully create multiple dates maintenance', async () => {
      mockPrisma.turfMaintenance.create.mockResolvedValue({ id: 'm-x' });

      const response = await service.createMaintenanceBlock('owner-auth-id', {
        turfId: 'turf-1',
        dates: ['2026-08-15', '2026-08-18', '2026-08-22'],
        reason: 'Ground Renovation',
      });

      expect(response.success).toBe(true);
      expect(mockPrisma.turfMaintenance.create).toHaveBeenCalledTimes(3);
    });

    it('should successfully create date range maintenance', async () => {
      mockPrisma.turfMaintenance.create.mockResolvedValue({ id: 'm-range' });

      const response = await service.createMaintenanceBlock('owner-auth-id', {
        turfId: 'turf-1',
        startDate: '2026-08-15',
        endDate: '2026-08-20',
        reason: 'Festival Holiday',
      });

      expect(response.success).toBe(true);
      expect(mockPrisma.turfMaintenance.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if conflict with existing confirmed bookings exists', async () => {
      mockPrisma.booking.findFirst.mockResolvedValue({ id: 'booking-id' });

      await expect(
        service.createMaintenanceBlock('owner-auth-id', {
          turfId: 'turf-1',
          date: '2026-08-15',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully update maintenance block', async () => {
      mockPrisma.turfMaintenance.findUnique.mockResolvedValue({
        id: 'm-1',
        turfId: 'turf-1',
        turf: { owner: { authId: 'owner-auth-id' } },
      });
      mockPrisma.turfMaintenance.update.mockResolvedValue({ id: 'm-1', reason: 'Updated Reason' });

      const response = await service.updateMaintenanceBlock('owner-auth-id', 'm-1', {
        startDate: '2026-08-15',
        endDate: '2026-08-20',
        reason: 'Updated Reason',
      });

      expect(response.success).toBe(true);
      expect(response.data.reason).toBe('Updated Reason');
    });

    it('should successfully delete maintenance block', async () => {
      mockPrisma.turfMaintenance.findUnique.mockResolvedValue({
        id: 'm-1',
        turfId: 'turf-1',
        turf: { owner: { authId: 'owner-auth-id' } },
      });
      mockPrisma.turfMaintenance.delete.mockResolvedValue({});

      const response = await service.deleteMaintenanceBlock('owner-auth-id', 'm-1');
      expect(response.success).toBe(true);
    });
  });
});
