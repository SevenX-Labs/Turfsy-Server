import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

const mockAuthService = {
  login: jest.fn(),
  verifyOtp: jest.fn(),
  resendOtp: jest.fn(),
  logout: jest.fn(),
  deleteAccount: jest.fn(),
  getMe: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: JwtService, useValue: { verify: jest.fn() } },
        {
          provide: PrismaService,
          useValue: { session: { findUnique: jest.fn() } },
        },
      ],
    });

    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({
      canActivate: jest.fn().mockResolvedValue(true),
    });

    const module: TestingModule = await moduleBuilder.compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── userLogin ──────────────────────────────────────────────────────

  describe('POST /user/login', () => {
    it('should call authService.login with USER role and return result', async () => {
      const dto = { phone: '9876543210' };
      const expected = {
        success: true,
        message: 'OTP sent successfully',
        expiresIn: 60,
      };
      mockAuthService.login.mockResolvedValue(expected);

      const result = await controller.userLogin(
        dto as any,
        '127.0.0.1',
        'jest',
      );
      expect(mockAuthService.login).toHaveBeenCalledWith(
        dto,
        '127.0.0.1',
        'jest',
        Role.USER,
      );
      expect(result).toEqual(expected);
    });
  });

  // ─── ownerLogin ─────────────────────────────────────────────────────

  describe('POST /owner/login', () => {
    it('should call authService.login with OWNER role and return result', async () => {
      const dto = { phone: '9876543210' };
      const expected = {
        success: true,
        message: 'OTP sent successfully',
        expiresIn: 60,
      };
      mockAuthService.login.mockResolvedValue(expected);

      const result = await controller.ownerLogin(
        dto as any,
        '127.0.0.1',
        'jest',
      );
      expect(mockAuthService.login).toHaveBeenCalledWith(
        dto,
        '127.0.0.1',
        'jest',
        Role.OWNER,
      );
      expect(result).toEqual(expected);
    });
  });

  // ─── userVerifyOtp ──────────────────────────────────────────────────

  describe('POST /user/verify-otp', () => {
    it('should call authService.verifyOtp with USER role', async () => {
      const dto = { phone: '9876543210', otp: '123456' };
      const expected = { success: true, accessToken: 'jwt', role: Role.USER };
      mockAuthService.verifyOtp.mockResolvedValue(expected);

      const result = await controller.userVerifyOtp(dto as any);
      expect(mockAuthService.verifyOtp).toHaveBeenCalledWith(dto, Role.USER);
      expect(result).toEqual(expected);
    });
  });

  // ─── ownerVerifyOtp ─────────────────────────────────────────────────

  describe('POST /owner/verify-otp', () => {
    it('should call authService.verifyOtp with OWNER role', async () => {
      const dto = { phone: '9876543210', otp: '123456' };
      const expected = { success: true, accessToken: 'jwt', role: Role.OWNER };
      mockAuthService.verifyOtp.mockResolvedValue(expected);

      const result = await controller.ownerVerifyOtp(dto as any);
      expect(mockAuthService.verifyOtp).toHaveBeenCalledWith(dto, Role.OWNER);
      expect(result).toEqual(expected);
    });
  });

  // ─── userResendOtp ──────────────────────────────────────────────────

  describe('POST /user/resend-otp', () => {
    it('should call authService.resendOtp', async () => {
      const dto = { phone: '9876543210' };
      mockAuthService.resendOtp.mockResolvedValue({
        success: true,
        message: 'OTP resent successfully',
      });

      const result = await controller.userResendOtp(dto as any);
      expect(mockAuthService.resendOtp).toHaveBeenCalledWith(dto);
      expect(result.success).toBe(true);
    });
  });

  // ─── ownerResendOtp ─────────────────────────────────────────────────

  describe('POST /owner/resend-otp', () => {
    it('should call authService.resendOtp', async () => {
      const dto = { phone: '9876543210' };
      mockAuthService.resendOtp.mockResolvedValue({
        success: true,
        message: 'OTP resent successfully',
      });

      const result = await controller.ownerResendOtp(dto as any);
      expect(mockAuthService.resendOtp).toHaveBeenCalledWith(dto);
      expect(result.success).toBe(true);
    });
  });

  // ─── logout ─────────────────────────────────────────────────────────

  describe('GET /logout', () => {
    it('should call authService.logout with sessionId from req.user', async () => {
      const req = {
        user: { sessionId: 'session-123', authId: 'auth-123' },
      } as any;
      mockAuthService.logout.mockResolvedValue({
        success: true,
        message: 'Logged out successfully',
      });

      const result = await controller.logout(req);
      expect(mockAuthService.logout).toHaveBeenCalledWith('session-123');
      expect(result.success).toBe(true);
    });
  });

  // ─── deleteAccount ──────────────────────────────────────────────────

  describe('DELETE /delete-account', () => {
    it('should call authService.deleteAccount with authId and dto', async () => {
      const req = { user: { authId: 'auth-123' } } as any;
      const dto = { sessionToken: 'token-abc' };
      mockAuthService.deleteAccount.mockResolvedValue({
        success: true,
        message: 'Account deleted successfully',
      });

      const result = await controller.deleteAccount(req, dto);
      expect(mockAuthService.deleteAccount).toHaveBeenCalledWith(
        'auth-123',
        dto,
      );
      expect(result.success).toBe(true);
    });
  });

  // ─── getMe ──────────────────────────────────────────────────────────

  describe('GET /get-me', () => {
    it('should call authService.getMe with authId from req.user', async () => {
      const req = { user: { authId: 'auth-123' } } as any;
      mockAuthService.getMe.mockResolvedValue({
        success: true,
        data: { id: 'auth-123' },
      });

      const result = await controller.getMe(req);
      expect(mockAuthService.getMe).toHaveBeenCalledWith('auth-123');
      expect(result.success).toBe(true);
    });
  });
});
