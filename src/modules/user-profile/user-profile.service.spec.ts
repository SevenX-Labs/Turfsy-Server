import { Test, TestingModule } from '@nestjs/testing';
import { UserProfileService } from './user-profile.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/services/cache.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Gender, Role } from '@prisma/client';

const mockPrisma = {
  auth: { findUnique: jest.fn() },
  userProfile: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  payment: { upsert: jest.fn() },
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  invalidate: jest.fn(),
  getOrSet: jest.fn(async (key, cb) => cb()),
};

describe('UserProfileService', () => {
  let service: UserProfileService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserProfileService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();
    service = module.get<UserProfileService>(UserProfileService);
  });

  afterEach(() => jest.clearAllMocks());

  const dto = {
    username: 'test_user',
    name: 'Test User',
    email: 'test@example.com',
    dob: '1995-01-01',
    gender: Gender.MALE,
    preferredSport: null,
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
    currentLat: 18.5,
    currentLng: 73.8,
  };

  describe('createProfile()', () => {
    it('should create profile successfully', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        role: Role.USER,
        isVerified: true,
        userProfile: null,
      });
      mockPrisma.userProfile.findFirst.mockResolvedValue(null);
      mockPrisma.userProfile.upsert.mockResolvedValue({
        id: 'profile-1',
        ...dto,
      });

      const result = await service.createProfile('auth-1', dto as any);
      expect(result.success).toBe(true);
      expect(result.data.id).toBe('profile-1');
    });

    it('should throw ForbiddenException if not verified', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        role: Role.USER,
        isVerified: false,
      });
      await expect(service.createProfile('auth-1', dto as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException if auth not found', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue(null);
      await expect(service.createProfile('auth-1', dto as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getProfile()', () => {
    it('should return profile with payment', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        name: 'Test',
        payment: null,
      });
      const result = await service.getProfile('auth-1');
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException if profile not found', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      await expect(service.getProfile('auth-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateHomeAddress()', () => {
    it('should update address successfully', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.userProfile.update.mockResolvedValue({
        id: 'profile-1',
        city: 'Mumbai',
      });
      const result = await service.updateHomeAddress('auth-1', {
        city: 'Mumbai',
      });
      expect(result.success).toBe(true);
      expect(result.data.city).toBe('Mumbai');
    });

    it('should throw NotFoundException if profile not found', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.updateHomeAddress('auth-1', { city: 'Mumbai' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile()', () => {
    it('should update profile successfully', async () => {
      mockPrisma.userProfile.update.mockResolvedValue({
        id: 'profile-1',
        name: 'Updated',
      });
      const result = await service.updateProfile('auth-1', { name: 'Updated' });
      expect(result.success).toBe(true);
    });
  });

  describe('savePaymentDetails()', () => {
    it('should save UPI ID', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue({ id: 'profile-1' });
      mockPrisma.payment.upsert.mockResolvedValue({ upiId: 'test@upi' });
      const result = await service.savePaymentDetails('auth-1', {
        upiId: 'test@upi',
      });
      expect(result.success).toBe(true);
      expect(result.message).toBe('Payment saved');
    });

    it('should throw NotFoundException if profile not found', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.savePaymentDetails('auth-1', { upiId: 'test@upi' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
