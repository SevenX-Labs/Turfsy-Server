import { Test, TestingModule } from '@nestjs/testing';
import { OwnerProfileService } from './owner-profile.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';

const mockPrisma = {
  auth: { findUnique: jest.fn() },
  ownerProfile: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  payment: { upsert: jest.fn() },
  turf: { findMany: jest.fn() },
  $executeRaw: jest.fn(),
};

describe('OwnerProfileService', () => {
  let service: OwnerProfileService;
  const createDto = {
    name: 'Owner One',
    email: 'owner@test.com',
    contactNumber: '9876543210',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerProfileService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OwnerProfileService>(OwnerProfileService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createProfile()', () => {
    it('creates owner profile successfully', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        phone: '9876543210',
        isVerified: true,
        role: Role.OWNER,
        ownerProfile: null,
      });
      mockPrisma.ownerProfile.findUnique.mockResolvedValue(null);
      mockPrisma.ownerProfile.upsert.mockResolvedValue({
        id: 'profile-1',
        authId: 'auth-1',
        ...createDto,
      });

      const result = await service.createProfile('auth-1', createDto);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Owner profile created successfully');
      expect(mockPrisma.ownerProfile.upsert).toHaveBeenCalledWith({
        where: { authId: 'auth-1' },
        create: {
          authId: 'auth-1',
          name: createDto.name,
          email: createDto.email,
          contactNumber: '9876543210',
        },
        update: {
          name: createDto.name,
          email: createDto.email,
          contactNumber: '9876543210',
        },
      });
    });

    it('throws if account is not found', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue(null);

      await expect(
        service.createProfile('missing-auth', createDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws if phone number is not verified', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        phone: '9876543210',
        isVerified: false,
        role: Role.OWNER,
        ownerProfile: null,
      });

      await expect(service.createProfile('auth-1', createDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws if role is not OWNER', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        phone: '9876543210',
        isVerified: true,
        role: Role.USER,
        ownerProfile: null,
      });

      await expect(service.createProfile('auth-1', createDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws if profile is already created', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        phone: '9876543210',
        isVerified: true,
        role: Role.OWNER,
        ownerProfile: { name: 'Existing Owner' },
      });

      await expect(service.createProfile('auth-1', createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws if contact number does not match verified auth phone', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        phone: '9999999999',
        isVerified: true,
        role: Role.OWNER,
        ownerProfile: null,
      });

      await expect(service.createProfile('auth-1', createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws if email is already in use', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        phone: '9876543210',
        isVerified: true,
        role: Role.OWNER,
        ownerProfile: null,
      });
      mockPrisma.ownerProfile.findUnique.mockResolvedValue({
        id: 'other-profile',
      });

      await expect(service.createProfile('auth-1', createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getProfile()', () => {
    it('returns profile with payment and turfs', async () => {
      mockPrisma.ownerProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        authId: 'auth-1',
        name: 'Owner One',
        payment: { upiId: 'owner@upi' },
      });
      mockPrisma.turf.findMany.mockResolvedValue([
        { id: 'turf-1', name: 'Arena' },
      ]);

      const result = await service.getProfile('auth-1');

      expect(result.success).toBe(true);
      expect(result.data.turfs).toEqual([{ id: 'turf-1', name: 'Arena' }]);
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
    });

    it('throws if profile is not found', async () => {
      mockPrisma.ownerProfile.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('auth-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile()', () => {
    it('updates owner profile and mirrors verified auth phone', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({ phone: '9876543210' });
      mockPrisma.ownerProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        authId: 'auth-1',
        email: 'old@test.com',
      });
      mockPrisma.ownerProfile.update.mockResolvedValue({
        id: 'profile-1',
        name: 'Updated Owner',
        contactNumber: '9876543210',
      });

      const result = await service.updateProfile('auth-1', {
        name: 'Updated Owner',
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.ownerProfile.update).toHaveBeenCalledWith({
        where: { authId: 'auth-1' },
        data: {
          name: 'Updated Owner',
          contactNumber: '9876543210',
        },
        include: {
          payment: true,
        },
      });
    });

    it('throws if auth account is not found', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile('auth-1', { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws if profile is not found', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({ phone: '9876543210' });
      mockPrisma.ownerProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProfile('auth-1', { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws if contact number does not match verified auth phone', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({ phone: '9876543210' });
      mockPrisma.ownerProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        authId: 'auth-1',
        email: 'owner@test.com',
      });

      await expect(
        service.updateProfile('auth-1', { contactNumber: '9999999999' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws if updated email is already in use', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({ phone: '9876543210' });
      mockPrisma.ownerProfile.findUnique
        .mockResolvedValueOnce({
          id: 'profile-1',
          authId: 'auth-1',
          email: 'old@test.com',
        })
        .mockResolvedValueOnce({ id: 'other-profile' });

      await expect(
        service.updateProfile('auth-1', { email: 'taken@test.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('savePaymentDetails()', () => {
    it('saves owner payment details', async () => {
      mockPrisma.ownerProfile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.payment.upsert.mockResolvedValue({ upiId: 'owner@upi' });

      const result = await service.savePaymentDetails('auth-1', {
        upiId: 'owner@upi',
      });

      expect(result.success).toBe(true);
      expect(result.data.upiId).toBe('owner@upi');
      expect(mockPrisma.payment.upsert).toHaveBeenCalledWith({
        where: { authId: 'auth-1' },
        update: { upiId: 'owner@upi' },
        create: {
          authId: 'auth-1',
          role: Role.OWNER,
          upiId: 'owner@upi',
          ownerProfileId: 'profile-1',
        },
      });
    });

    it('throws if owner profile does not exist', async () => {
      mockPrisma.ownerProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.savePaymentDetails('auth-1', { upiId: 'owner@upi' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
