import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { CacheService } from '../../common/services/cache.service';
import { MetricsService } from '../../common/metrics/metrics.service';

jest.mock('axios');
jest.mock('bcrypt');

const mockPrisma = {
  auth: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  otpEntry: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  session: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  userProfile: { findUnique: jest.fn(), create: jest.fn() },
  ownerProfile: { findUnique: jest.fn(), create: jest.fn() },
  turf: { findMany: jest.fn() },
  slotLock: { deleteMany: jest.fn() },
  $executeRaw: jest.fn(),
  $transaction: jest.fn(async (arg: any) => {
    if (typeof arg === 'function') {
      return arg(mockPrisma);
    }
    return Promise.all(arg);
  }),
};

const mockJwt = { sign: jest.fn().mockReturnValue('mocked.jwt.token') };
const mockConfig = { get: jest.fn((_key, def) => def ?? '7') };
const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  invalidate: jest.fn(),
};
const mockMetrics = {
  otpSentTotal: { inc: jest.fn() },
  otpVerifiedTotal: { inc: jest.fn() },
  loginTotal: { inc: jest.fn() },
  signupTotal: { inc: jest.fn() },
  logoutTotal: { inc: jest.fn() },
  refreshTokenTotal: { inc: jest.fn() },
  activeUsersGauge: { inc: jest.fn(), dec: jest.fn() },
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    mockJwt.sign.mockReturnValue('mocked.jwt.token');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: CacheService, useValue: mockCache },
        { provide: MetricsService, useValue: mockMetrics },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('login()', () => {
    it('should create OTP entry and return success payload', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue(null);
      mockPrisma.auth.create.mockResolvedValue({
        id: 'auth-1',
        phone: '9876543210',
        isActive: true,
        role: Role.USER,
      });
      mockPrisma.otpEntry.deleteMany.mockResolvedValue({ count: 0 });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-otp');
      mockPrisma.otpEntry.create.mockResolvedValue({ id: 'otp-1' });

      const result = await service.login(
        { phone: '9876543210' },
        '127.0.0.1',
        'jest',
        Role.USER,
      );

      expect(result.success).toBe(true);
      expect(result.expiresIn).toBe(60);
      expect(mockPrisma.auth.create).toHaveBeenCalled();
      expect(mockPrisma.otpEntry.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if account is deactivated', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        isActive: false,
        role: Role.USER,
      });

      await expect(
        service.login({ phone: '9876543210' }, '', '', Role.USER),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyOtp()', () => {
    const mockOtpEntry = {
      id: 'otp-1',
      authId: 'auth-1',
      code: 'hashed',
      expiresAt: new Date(Date.now() + 60000),
      verifiedAt: null,
      auth: { id: 'auth-1', role: Role.USER, phone: '9876543210' },
    };

    it('should verify OTP, select role, and return JWT', async () => {
      mockPrisma.auth.findUnique.mockResolvedValueOnce({
        id: 'auth-1',
        phone: '9876543210',
        userProfile: null,
        ownerProfile: null,
      });
      mockPrisma.otpEntry.findFirst.mockResolvedValue(mockOtpEntry);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.otpEntry.update.mockResolvedValue({});
      mockPrisma.session.create.mockResolvedValue({ id: 'session-1' });
      mockPrisma.auth.update.mockResolvedValue({});

      const result = await service.verifyOtp(
        { phone: '9876543210', otp: '123456' },
        Role.USER,
      );

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('mocked.jwt.token');
      expect(result.role).toBe(Role.USER);
    });

    it('should throw NotFoundException if account not found', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyOtp({ phone: '9876543210', otp: '123456' }, Role.USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if OTP already used', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        phone: '9876543210',
      });
      mockPrisma.otpEntry.findFirst.mockResolvedValue({
        ...mockOtpEntry,
        verifiedAt: new Date(),
      });

      await expect(
        service.verifyOtp({ phone: '9876543210', otp: '123456' }, Role.USER),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if OTP expired', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        phone: '9876543210',
      });
      mockPrisma.otpEntry.findFirst.mockResolvedValue({
        ...mockOtpEntry,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.verifyOtp({ phone: '9876543210', otp: '123456' }, Role.USER),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if OTP invalid', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        phone: '9876543210',
      });
      mockPrisma.otpEntry.findFirst.mockResolvedValue(mockOtpEntry);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.verifyOtp({ phone: '9876543210', otp: '999999' }, Role.USER),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('resendOtp()', () => {
    it('should resend OTP and reset expiry', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        phone: '9876543210',
      });
      mockPrisma.otpEntry.findFirst.mockResolvedValue({
        id: 'otp-1',
        authId: 'auth-1',
        verifiedAt: null,
        lastResentAt: null,
        auth: { phone: '9876543210' },
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed');
      mockPrisma.otpEntry.update.mockResolvedValue({});

      const result = await service.resendOtp({ phone: '9876543210' });
      expect(result.success).toBe(true);
    });

    it('should throw 429 if called within 60s', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        phone: '9876543210',
      });
      mockPrisma.otpEntry.findFirst.mockResolvedValue({
        id: 'otp-1',
        verifiedAt: null,
        lastResentAt: new Date(Date.now() - 10000),
        auth: { phone: '9876543210' },
      });

      await expect(service.resendOtp({ phone: '9876543210' })).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('logout()', () => {
    it('should revoke session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        revokedAt: null,
      });
      mockPrisma.session.update.mockResolvedValue({});

      const result = await service.logout('session-1');
      expect(result.success).toBe(true);
    });

    it('should throw if session already revoked', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        revokedAt: new Date(),
      });

      await expect(service.logout('session-1')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('deleteAccount()', () => {
    it('should hard delete account and related slot locks', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({ id: 'auth-1' });
      mockPrisma.otpEntry.findFirst.mockResolvedValue({
        id: 'otp-1',
        verifiedAt: new Date(),
      });
      mockPrisma.ownerProfile.findUnique.mockResolvedValue({ id: 'owner-1' });
      mockPrisma.turf.findMany.mockResolvedValue([{ id: 'turf-1' }]);
      mockPrisma.slotLock.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.auth.delete.mockResolvedValue({ id: 'auth-1' });

      const result = await service.deleteAccount('auth-1', {
        sessionToken: 'token',
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.auth.delete).toHaveBeenCalledWith({
        where: { id: 'auth-1' },
      });
    });

    it('should throw NotFoundException if auth not found', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteAccount('bad-id', { sessionToken: 'token' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMe()', () => {
    it('should return user with profile and payment', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1',
        role: Role.USER,
        isActive: true,
        userProfile: { name: 'Test User' },
        ownerProfile: null,
        payment: { upiId: 'test@upi' },
      });

      const result = await service.getMe('auth-1');
      expect(result.success).toBe(true);
      expect(result.data.profile).toEqual({ name: 'Test User' });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue(null);

      await expect(service.getMe('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
