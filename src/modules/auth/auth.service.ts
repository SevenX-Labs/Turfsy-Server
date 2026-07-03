import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/services/cache.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly OTP_EXPIRY_SECONDS = 60;
  private readonly RESEND_LIMIT_SECONDS = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly cacheService: CacheService,
    private readonly metrics: MetricsService,
  ) {}

  // ─────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async hashOtp(otp: string): Promise<string> {
    return bcrypt.hash(otp, 10);
  }

  private async sendOtpViaSms(phone: string, otp: string): Promise<void> {
    const displayOtp = process.env.NODE_ENV === 'production' ? '[REDACTED]' : otp;
    this.logger.log({ message: `Sending OTP to ${phone}`, phone, otp: displayOtp });
    try {
      const response = await axios.post(
        'https://www.fast2sms.com/dev/bulkV2',
        {
          route: 'otp',
          variables_values: otp,
          numbers: phone,
        },
        {
          headers: {
            authorization: this.config.get<string>('OTP_API_KEY') || '',
            'Content-Type': 'application/json',
          },
        },
      );
      this.logger.log({ message: 'Fast2SMS response received', response: response.data });
    } catch (err) {
      this.logger.error(
        `Fast2SMS OTP transmission error: ${err.message}`,
        err.stack,
        { errorDetails: err?.response?.data || err.message }
      );
    }
  }

  private generateSessionToken(authId: string, sessionId: string, role: Role) {
    return this.jwtService.sign({ authId, sessionId, role });
  }

  private async normalizeOwnerTurfStatuses(authId: string) {
    await this.prisma.$executeRaw`
      UPDATE "Turf"
      SET "status" = 'INACTIVE'::"TurfStatus"
      WHERE EXISTS (
        SELECT 1
        FROM "OwnerProfile" op
        WHERE op."id" = "Turf"."ownerProfileId"
          AND op."authId" = ${authId}
      )
        AND "status"::text NOT IN ('ACTIVE', 'INACTIVE')
    `;
  }

  // ─────────────────────────────────────────
  // POST /user/login  or  /owner/login
  // Role is determined by the endpoint, not by the user
  // ─────────────────────────────────────────

  async login(dto: LoginDto, ip: string, userAgent: string, role: Role) {
    const { phone } = dto;

    // ── Layer 1: Phone-based OTP Rate Limiting ──
    const cacheKeyOtp = `otp_rate_limit:${phone}`;
    const attempts = (await this.cacheService.get<number>(cacheKeyOtp)) || 0;
    if (attempts >= 5) {
      throw new HttpException(
        {
          success: false,
          message:
            'Too many OTP requests for this phone. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.cacheService.set(cacheKeyOtp, attempts + 1, 1000 * 60 * 60);

    let auth = await this.prisma.auth.findUnique({ where: { phone } });
    if (!auth) {
      // First time user — create auth record with this role
      auth = await this.prisma.auth.create({
        data: { phone, role },
      });
    } else if (auth.role !== role) {
      // Same phone switching between apps — update role to match current app
      auth = await this.prisma.auth.update({
        where: { id: auth.id },
        data: { role },
      });
    }

    if (!auth.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const otp = this.generateOtp();
    const hashedOtp = await this.hashOtp(otp);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_SECONDS * 1000);
    const sessionToken = crypto.randomUUID();

    await this.cacheService.set(`otp:${phone}:login`, {
      code: hashedOtp,
      attempts: 0,
      sessionToken,
      lastResentAt: Date.now(),
      resendCount: 0,
    }, this.OTP_EXPIRY_SECONDS * 1000);

    await this.sendOtpViaSms(phone, otp);
    this.logger.log({ event: 'otp_generated', phone, expiresAt, role });
    this.metrics.otpSentTotal.inc({ role });

    return {
      success: true,
      message: 'OTP sent successfully',
      expiresIn: this.OTP_EXPIRY_SECONDS,
    };
  }

  // ─────────────────────────────────────────
  // POST /user/verify-otp  or  /owner/verify-otp
  // Role is determined by the endpoint
  // ─────────────────────────────────────────

  async verifyOtp(dto: VerifyOtpDto, role: Role) {
    const { phone, otp } = dto;

    const auth = await this.prisma.auth.findUnique({
      where: { phone },
      include: {
        userProfile: true,
        ownerProfile: true,
      },
    });

    if (!auth) {
      throw new NotFoundException('Account not found');
    }

    const otpPayload = await this.cacheService.get<{
      code: string;
      attempts: number;
      sessionToken: string;
    }>(`otp:${phone}:login`);

    if (!otpPayload) {
      throw new NotFoundException(
        'Invalid or expired OTP request. Please login again',
      );
    }

    otpPayload.attempts++;

    const isValid = await bcrypt.compare(otp, otpPayload.code);
    if (!isValid) {
      if (otpPayload.attempts >= 5) {
        await this.cacheService.invalidate(`otp:${phone}:login`);
        throw new UnauthorizedException('Too many failed attempts. Please login again');
      } else {
        await this.cacheService.set(`otp:${phone}:login`, otpPayload, this.OTP_EXPIRY_SECONDS * 1000);
      }
      throw new UnauthorizedException('Invalid OTP');
    }

    // Clean up OTP on success
    await this.cacheService.invalidate(`otp:${phone}:login`);

    // Store verified session token in Redis for deleteAccount check
    await this.cacheService.set(`otp:verified:${auth.id}`, otpPayload.sessionToken, 1000 * 60 * 60 * 24); // 24 hours

    this.logger.log({ event: 'otp_verified', phone, role });
    this.metrics.otpVerifiedTotal.inc({ role });

    // Ensure role in DB matches the endpoint role
    await this.prisma.auth.update({
      where: { id: auth.id },
      data: { isVerified: true, role },
    });

    // Create session (30-day inactivity window)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const session = await this.prisma.session.create({
      data: { authId: auth.id, expiresAt },
    });

    // Determine if this is a new user (no profile yet)
    const isNewUser =
      role === Role.USER ? !auth.userProfile : !auth.ownerProfile;

    if (isNewUser) {
      this.logger.log({ event: 'user_signup', phone, role, userId: auth.id });
      this.metrics.signupTotal.inc({ role });
    } else {
      this.logger.log({ event: 'user_login', phone, role, userId: auth.id });
      this.metrics.loginTotal.inc({ role });
    }
    this.metrics.activeUsersGauge.inc();

    // Generate JWT with the role from the endpoint
    const token = this.generateSessionToken(auth.id, session.id, role);

    return {
      success: true,
      message: 'OTP verified successfully',
      accessToken: token,
      role,
      isNewUser,
      auth: {
        id: auth.id,
        phone: auth.phone,
        role: role,
      },
    };
  }

  // ─────────────────────────────────────────
  // POST /user/resend-otp  or  /owner/resend-otp
  // ─────────────────────────────────────────

  async resendOtp(dto: ResendOtpDto) {
    const { phone } = dto;

    const auth = await this.prisma.auth.findUnique({
      where: { phone },
    });

    if (!auth) {
      throw new NotFoundException('Account not found');
    }

    // ── Layer 1: Phone-based OTP Rate Limiting Bypass Check ──
    const cacheKeyOtp = `otp_rate_limit:${phone}`;
    const attempts = (await this.cacheService.get<number>(cacheKeyOtp)) || 0;
    if (attempts >= 5) {
      throw new HttpException(
        {
          success: false,
          message:
            'Too many OTP requests for this phone. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.cacheService.set(cacheKeyOtp, attempts + 1, 1000 * 60 * 60);

    const otpPayload = await this.cacheService.get<{
      code: string;
      attempts: number;
      sessionToken: string;
      lastResentAt: number;
      resendCount: number;
    }>(`otp:${phone}:login`);

    if (!otpPayload) {
      throw new NotFoundException('Invalid OTP request');
    }

    const diff = (Date.now() - otpPayload.lastResentAt) / 1000;
    if (diff < this.RESEND_LIMIT_SECONDS) {
      const waitSeconds = Math.ceil(this.RESEND_LIMIT_SECONDS - diff);
      throw new HttpException(
        {
          success: false,
          message: `Please wait ${waitSeconds}s before resending`,
          retryAfter: waitSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const otp = this.generateOtp();
    const hashedOtp = await this.hashOtp(otp);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_SECONDS * 1000);

    otpPayload.code = hashedOtp;
    otpPayload.attempts = 0;
    otpPayload.lastResentAt = Date.now();
    otpPayload.resendCount++;

    await this.cacheService.set(`otp:${phone}:login`, otpPayload, this.OTP_EXPIRY_SECONDS * 1000);

    await this.sendOtpViaSms(auth.phone, otp);
    this.logger.log({ event: 'otp_regenerated', phone: auth.phone, expiresAt, role: auth.role });

    return {
      success: true,
      message: 'OTP resent successfully',
      expiresIn: this.OTP_EXPIRY_SECONDS,
    };
  }

  // ─────────────────────────────────────────
  // GET /logout
  // ─────────────────────────────────────────

  async logout(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.revokedAt) {
      throw new UnauthorizedException(
        'Session not found or already logged out',
      );
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    this.logger.log({ event: 'logout', sessionId, authId: session.authId });
    this.metrics.logoutTotal.inc();
    this.metrics.activeUsersGauge.dec();

    // Invalidate cached user data on logout
    await this.cacheService.invalidate(`auth:getMe:${session.authId}`);

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  // ─────────────────────────────────────────
  // DELETE /delete-account
  // ─────────────────────────────────────────

  async deleteAccount(authId: string, dto: DeleteAccountDto) {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
    });

    if (!auth) {
      throw new NotFoundException('Account not found');
    }

    const verifiedToken = await this.cacheService.get<string>(`otp:verified:${authId}`);
    if (!verifiedToken || verifiedToken !== dto.sessionToken) {
      throw new UnauthorizedException(
        'Please verify OTP before deleting account',
      );
    }

    // Invalidate the verified token from cache
    await this.cacheService.invalidate(`otp:verified:${authId}`);

    // Hard-delete account from DB.
    // Most related records are removed via FK onDelete: Cascade from Auth.
    // SlotLock has no declared relation in Prisma schema, so clean it manually.
    const ownerProfile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
      select: { id: true },
    });

    const ownerTurfIds = ownerProfile
      ? (
          await this.prisma.turf.findMany({
            where: { ownerProfileId: ownerProfile.id },
            select: { id: true },
          })
        ).map((t) => t.id)
      : [];

    await this.prisma.$transaction(async (tx) => {
      // Remove slot locks created by this user
      await (tx as any).slotLock.deleteMany({
        where: { userId: authId },
      });

      // Remove slot locks against owner's turfs (if owner account)
      if (ownerTurfIds.length > 0) {
        await (tx as any).slotLock.deleteMany({
          where: { turfId: { in: ownerTurfIds } },
        });
      }

      // Delete root auth record; cascades remove dependent data
      await tx.auth.delete({
        where: { id: authId },
      });
    });

    return {
      success: true,
      message: 'Account deleted successfully',
    };
  }

  // ─────────────────────────────────────────
  // GET /get-me (cached for 2 minutes)
  // ─────────────────────────────────────────

  async getMe(authId: string) {
    const cacheKey = `auth:getMe:${authId}`;
    const cached = await this.cacheService.get<any>(cacheKey);
    if (cached) return cached;

    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
      include: {
        userProfile: true,
        ownerProfile: true,
        payment: true,
      },
    });

    if (!auth || !auth.isActive) {
      throw new NotFoundException('User not found');
    }

    const { userProfile, ownerProfile, payment, ...authData } = auth;
    let profile: Record<string, any> | null =
      auth.role === Role.OWNER ? ownerProfile : userProfile;

    if (auth.role === Role.OWNER && ownerProfile) {
      await this.normalizeOwnerTurfStatuses(authId);

      const turfs = await this.prisma.turf.findMany({
        where: {
          owner: { authId },
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });

      profile = {
        ...ownerProfile,
        turfs,
      };
    }

    // Include phone number in the result specifically
    const result = {
      success: true,
      data: {
        ...authData,
        phone: auth.phone,
        profile,
        payment,
      },
    };

    // Cache for 2 minutes
    await this.cacheService.set(cacheKey, result, 1000 * 60 * 2);
    return result;
  }

  // ─────────────────────────────────────────
  // POST /request-phone-change (authenticated)
  // Sends OTP to the NEW phone number
  // ─────────────────────────────────────────

  async requestPhoneChange(authId: string, newPhone: string) {
    const auth = await this.prisma.auth.findUnique({ where: { id: authId } });
    if (!auth) throw new NotFoundException('Account not found');
    if (!auth.isActive)
      throw new UnauthorizedException('Account is deactivated');

    // New phone must not already be registered
    const existing = await this.prisma.auth.findUnique({
      where: { phone: newPhone },
    });
    if (existing && existing.id !== authId) {
      throw new ConflictException(
        'This phone number is already registered to another account',
      );
    }

    // ── Layer 1: Phone-based OTP Rate Limiting Bypass Check ──
    const cacheKeyOtp = `otp_rate_limit:${newPhone}`;
    const attempts = (await this.cacheService.get<number>(cacheKeyOtp)) || 0;
    if (attempts >= 5) {
      throw new HttpException(
        {
          success: false,
          message:
            'Too many OTP requests for this phone. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.cacheService.set(cacheKeyOtp, attempts + 1, 1000 * 60 * 60);

    const otp = this.generateOtp();
    const hashedOtp = await this.hashOtp(otp);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_SECONDS * 1000);
    const sessionToken = crypto.randomUUID();

    const otpPayload = {
      code: hashedOtp,
      attempts: 0,
      sessionToken,
      newPhone,
    };

    await this.cacheService.set(`otp:${authId}:phone-change`, otpPayload, this.OTP_EXPIRY_SECONDS * 1000);

    await this.sendOtpViaSms(newPhone, otp);

    return {
      success: true,
      message: `OTP sent to ${newPhone}`,
      sessionToken,
      newPhone,
      expiresIn: this.OTP_EXPIRY_SECONDS,
    };
  }

  // ─────────────────────────────────────────
  // POST /verify-phone-change (authenticated)
  // Verifies OTP + updates phone in Auth
  // ─────────────────────────────────────────

  async verifyPhoneChange(
    authId: string,
    sessionToken: string,
    newPhone: string,
    otp: string,
  ) {
    const auth = await this.prisma.auth.findUnique({ where: { id: authId } });
    if (!auth) throw new NotFoundException('Account not found');

    const otpPayload = await this.cacheService.get<{
      code: string;
      attempts: number;
      sessionToken: string;
      newPhone: string;
    }>(`otp:${authId}:phone-change`);

    if (!otpPayload || otpPayload.sessionToken !== sessionToken) {
      throw new NotFoundException('Invalid session token');
    }

    otpPayload.attempts++;

    const isValid = await bcrypt.compare(otp, otpPayload.code);
    if (!isValid) {
      if (otpPayload.attempts >= 5) {
        await this.cacheService.invalidate(`otp:${authId}:phone-change`);
        throw new UnauthorizedException('Too many failed attempts. Please request again');
      } else {
        await this.cacheService.set(`otp:${authId}:phone-change`, otpPayload, this.OTP_EXPIRY_SECONDS * 1000);
      }
      throw new UnauthorizedException('Invalid OTP');
    }

    // Double-check new phone is still available
    const taken = await this.prisma.auth.findUnique({
      where: { phone: newPhone },
    });
    if (taken && taken.id !== authId) {
      throw new ConflictException(
        'This phone number is already registered to another account',
      );
    }

    // Clean up OTP on success
    await this.cacheService.invalidate(`otp:${authId}:phone-change`);

    // Store verified session token in Redis for deleteAccount check
    await this.cacheService.set(`otp:verified:${authId}`, sessionToken, 1000 * 60 * 60 * 24); // 24 hours

    // Update phone atomically
    await this.prisma.auth.update({
      where: { id: authId },
      data: { phone: newPhone },
    });

    return {
      success: true,
      message: 'Phone number updated successfully',
      data: { phone: newPhone },
    };
  }
}
