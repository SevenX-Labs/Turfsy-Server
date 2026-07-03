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
  });
});
