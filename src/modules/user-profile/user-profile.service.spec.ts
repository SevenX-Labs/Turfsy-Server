import { Test, TestingModule } from '@nestjs/testing';
import { UserProfileService } from './user-profile.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Gender, Role } from '@prisma/client';

const mockPrisma = {
  auth: { findUnique: jest.fn() },
  userProfile: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  userSettings: { upsert: jest.fn() },
  payment: { upsert: jest.fn() },
};

describe('UserProfileService', () => {
  let service: UserProfileService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserProfileService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<UserProfileService>(UserProfileService);
  });

  afterEach(() => jest.clearAllMocks());

  const dto = {
    name: 'Test User',
    email: 'test@example.com',
    avatarUrl: 'https://example.com/avatar.jpg',
    dob: '1995-01-01',
    gender: Gender.MALE,
  };

  // ─── createProfile ──────────────────────────────────────────────

  describe('createProfile()', () => {
    it('should create profile successfully', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        role: Role.USER,
        isVerified: true,
        userProfile: { name: '' },
      });
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      mockPrisma.userProfile.upsert.mockResolvedValue({ id: 'profile-1', ...dto });

      const result = await service.createProfile('auth-1', dto);
      expect(result.success).toBe(true);
    });

    it('should throw ForbiddenException if role is OWNER', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        role: Role.OWNER,
        isVerified: true,
        userProfile: null,
      });
      await expect(service.createProfile('auth-1', dto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if profile already created', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        role: Role.USER,
        isVerified: true,
        userProfile: { name: 'Existing' },
      });
      await expect(service.createProfile('auth-1', dto)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if email already in use', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        role: Role.USER,
        isVerified: true,
        userProfile: { name: '' },
      });
      mockPrisma.userProfile.findUnique.mockResolvedValue({ id: 'other-profile' });
      await expect(service.createProfile('auth-1', dto)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if auth not found', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue(null);
      await expect(service.createProfile('auth-1', dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getProfile ─────────────────────────────────────────────────

  describe('getProfile()', () => {
    it('should return profile with payment', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue({ id: 'profile-1', name: 'Test', payment: null });
      const result = await service.getProfile('auth-1');
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException if profile not found', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      await expect(service.getProfile('auth-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateProfile ──────────────────────────────────────────────

  describe('updateProfile()', () => {
    it('should update profile successfully', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue({ id: 'profile-1', authId: 'auth-1', email: 'old@test.com' });
      mockPrisma.userProfile.update.mockResolvedValue({ id: 'profile-1', name: 'Updated' });
      const result = await service.updateProfile('auth-1', { name: 'Updated' });
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException if profile not found', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      await expect(service.updateProfile('auth-1', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if new email already in use', async () => {
      mockPrisma.userProfile.findUnique
        .mockResolvedValueOnce({ id: 'profile-1', authId: 'auth-1', email: 'old@test.com' })
        .mockResolvedValueOnce({ id: 'other-profile' });
      await expect(service.updateProfile('auth-1', { email: 'taken@test.com' })).rejects.toThrow(ConflictException);
    });
  });

  // ─── savePaymentDetails ─────────────────────────────────────────

  describe('savePaymentDetails()', () => {
    it('should save UPI ID', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.payment.upsert.mockResolvedValue({ upiId: 'test@upi' });
      const result = await service.savePaymentDetails('auth-1', { upiId: 'test@upi' });
      expect(result.success).toBe(true);
      expect(result.data.upiId).toBe('test@upi');
    });

    it('should throw NotFoundException if profile not found', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      await expect(service.savePaymentDetails('auth-1', { upiId: 'test@upi' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateLocation ─────────────────────────────────────────────

  describe('updateLocation()', () => {
    it('should update location successfully', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.userProfile.update.mockResolvedValue({ currentLat: 18.5, currentLng: 73.8 });
      const result = await service.updateLocation('auth-1', 18.5, 73.8, 'Pune');
      expect(result.success).toBe(true);
    });

    it('should throw BadRequestException if lat/lng missing', async () => {
      await expect(service.updateLocation('auth-1', 0, 0)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if profile not found', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      await expect(service.updateLocation('auth-1', 18.5, 73.8)).rejects.toThrow(NotFoundException);
    });
  });
});
