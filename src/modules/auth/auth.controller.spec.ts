import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Role } from '@prisma/client';

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
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── login ──────────────────────────────────────────────────────────

  describe('POST /login', () => {
    it('should call authService.login and return result', async () => {
      const dto = { phone: '9876543210', role: Role.USER };
      const expected = { success: true, message: 'OTP sent successfully', sessionToken: 'abc', expiresIn: 60 };
      mockAuthService.login.mockResolvedValue(expected);

      const result = await controller.login(dto as any, '127.0.0.1', 'jest');
      expect(mockAuthService.login).toHaveBeenCalledWith(dto, '127.0.0.1', 'jest');
      expect(result).toEqual(expected);
    });
  });

  // ─── verifyOtp ──────────────────────────────────────────────────────

  describe('POST /verify-otp', () => {
    it('should call authService.verifyOtp and return token', async () => {
      const dto = { sessionToken: 'token-abc', otp: '123456' };
      const expected = { success: true, accessToken: 'jwt', role: Role.USER };
      mockAuthService.verifyOtp.mockResolvedValue(expected);

      const result = await controller.verifyOtp(dto);
      expect(mockAuthService.verifyOtp).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  // ─── resendOtp ──────────────────────────────────────────────────────

  describe('POST /resend-otp', () => {
    it('should call authService.resendOtp', async () => {
      const dto = { sessionToken: 'token-abc' };
      mockAuthService.resendOtp.mockResolvedValue({ success: true, message: 'OTP resent successfully' });

      const result = await controller.resendOtp(dto);
      expect(mockAuthService.resendOtp).toHaveBeenCalledWith(dto);
      expect(result.success).toBe(true);
    });
  });

  // ─── logout ─────────────────────────────────────────────────────────

  describe('GET /logout', () => {
    it('should call authService.logout with sessionId from req.user', async () => {
      const req = { user: { sessionId: 'session-123', authId: 'auth-123' } } as any;
      mockAuthService.logout.mockResolvedValue({ success: true, message: 'Logged out successfully' });

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
      mockAuthService.deleteAccount.mockResolvedValue({ success: true, message: 'Account deleted successfully' });

      const result = await controller.deleteAccount(req, dto);
      expect(mockAuthService.deleteAccount).toHaveBeenCalledWith('auth-123', dto);
      expect(result.success).toBe(true);
    });
  });

  // ─── getMe ──────────────────────────────────────────────────────────

  describe('GET /get-me', () => {
    it('should call authService.getMe with authId from req.user', async () => {
      const req = { user: { authId: 'auth-123' } } as any;
      mockAuthService.getMe.mockResolvedValue({ success: true, data: { id: 'auth-123' } });

      const result = await controller.getMe(req);
      expect(mockAuthService.getMe).toHaveBeenCalledWith('auth-123');
      expect(result.success).toBe(true);
    });
  });
});