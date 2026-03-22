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

jest.mock('axios');
jest.mock('bcrypt');

const mockPrisma = {
  auth: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  otpEntry: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  session: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  userProfile: { findUnique: jest.fn(), create: jest.fn() },
  ownerProfile: { findUnique: jest.fn(), create: jest.fn() },
  $transaction: jest.fn((ops) => Promise.all(ops)),
};

const mockJwt = { sign: jest.fn().mockReturnValue('mocked.jwt.token') };
const mockConfig = { get: jest.fn((key, def) => def ?? '7') };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── login ──────────────────────────────────────────────────────────

  describe('login()', () => {
    it('should create OtpEntry and return sessionToken', async () => {
      mockPrisma.auth.upsert.mockResolvedValue({ id: 'auth-1', phone: '9876543210', isActive: true, role: Role.USER });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-otp');
      mockPrisma.otpEntry.create.mockResolvedValue({ sessionToken: 'session-token-abc' });

      const result = await service.login({ phone: '9876543210', role: Role.USER }, '127.0.0.1', 'jest');

      expect(result.success).toBe(true);
      expect(result.sessionToken).toBe('session-token-abc');
      expect(mockPrisma.otpEntry.create).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if account is deactivated', async () => {
      mockPrisma.auth.upsert.mockResolvedValue({ id: 'auth-1', isActive: false });

      await expect(service.login({ phone: '9876543210', role: Role.USER }, '', '')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── verifyOtp ──────────────────────────────────────────────────────

  describe('verifyOtp()', () => {
    const mockOtpEntry = {
      id: 'otp-1',
      authId: 'auth-1',
      code: 'hashed',
      expiresAt: new Date(Date.now() + 60000),
      verifiedAt: null,
      auth: { id: 'auth-1', role: Role.USER, phone: '9876543210' },
    };

    it('should verify OTP, create session, return JWT', async () => {
      mockPrisma.otpEntry.findUnique.mockResolvedValue(mockOtpEntry);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockPrisma.otpEntry.update.mockResolvedValue({});
      mockPrisma.session.create.mockResolvedValue({ id: 'session-1' });
      mockPrisma.auth.update.mockResolvedValue({});
      mockPrisma.userProfile.findUnique.mockResolvedValue(null);
      mockPrisma.userProfile.create.mockResolvedValue({});

      const result = await service.verifyOtp({ sessionToken: 'token', otp: '123456' });

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('mocked.jwt.token');
    });

    it('should throw NotFoundException if sessionToken not found', async () => {
      mockPrisma.otpEntry.findUnique.mockResolvedValue(null);

      await expect(service.verifyOtp({ sessionToken: 'bad', otp: '123456' })).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if OTP already used', async () => {
      mockPrisma.otpEntry.findUnique.mockResolvedValue({ ...mockOtpEntry, verifiedAt: new Date() });

      await expect(service.verifyOtp({ sessionToken: 'token', otp: '123456' })).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if OTP expired', async () => {
      mockPrisma.otpEntry.findUnique.mockResolvedValue({ ...mockOtpEntry, expiresAt: new Date(Date.now() - 1000) });

      await expect(service.verifyOtp({ sessionToken: 'token', otp: '123456' })).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if OTP invalid', async () => {
      mockPrisma.otpEntry.findUnique.mockResolvedValue(mockOtpEntry);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.verifyOtp({ sessionToken: 'token', otp: '999999' })).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── resendOtp ──────────────────────────────────────────────────────

  describe('resendOtp()', () => {
    it('should resend OTP and reset expiry', async () => {
      mockPrisma.otpEntry.findUnique.mockResolvedValue({
        id: 'otp-1', authId: 'auth-1', verifiedAt: null, lastResentAt: null,
        auth: { phone: '9876543210' },
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed');
      mockPrisma.otpEntry.update.mockResolvedValue({});

      const result = await service.resendOtp({ sessionToken: 'token' });
      expect(result.success).toBe(true);
    });

    it('should throw 429 if called within 60s', async () => {
      mockPrisma.otpEntry.findUnique.mockResolvedValue({
        id: 'otp-1', verifiedAt: null,
        lastResentAt: new Date(Date.now() - 10000), // 10s ago
        auth: { phone: '9876543210' },
      });

      await expect(service.resendOtp({ sessionToken: 'token' })).rejects.toThrow(HttpException);
    });
  });

  // ─── logout ─────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('should revoke session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({ id: 'session-1', revokedAt: null });
      mockPrisma.session.update.mockResolvedValue({});

      const result = await service.logout('session-1');
      expect(result.success).toBe(true);
    });

    it('should throw if session already revoked', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({ id: 'session-1', revokedAt: new Date() });

      await expect(service.logout('session-1')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── deleteAccount ──────────────────────────────────────────────────

  describe('deleteAccount()', () => {
    it('should soft delete account and revoke all sessions', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({ id: 'auth-1' });
      mockPrisma.otpEntry.findFirst.mockResolvedValue({ id: 'otp-1', verifiedAt: new Date() });
      mockPrisma.session.updateMany.mockResolvedValue({});
      mockPrisma.auth.update.mockResolvedValue({});

      const result = await service.deleteAccount('auth-1', { sessionToken: 'token' });
      expect(result.success).toBe(true);
    });

    it('should throw NotFoundException if auth not found', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue(null);

      await expect(service.deleteAccount('bad-id', { sessionToken: 'token' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getMe ──────────────────────────────────────────────────────────

  describe('getMe()', () => {
    it('should return user with profile and payment', async () => {
      mockPrisma.auth.findUnique.mockResolvedValue({
        id: 'auth-1', role: Role.USER, isActive: true,
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