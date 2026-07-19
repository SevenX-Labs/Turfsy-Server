import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  HttpException,
  HttpStatus,
  Logger,
  ForbiddenException,
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
import { CreateMpinDto } from './dto/create-mpin.dto';
import { VerifyMpinDto } from './dto/verify-mpin.dto';
import { ChangeMpinDto } from './dto/change-mpin.dto';
import { ResetMpinDto } from './dto/reset-mpin.dto';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly OTP_EXPIRY_SECONDS = 180;
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
    // TEMPORARY: Always show OTP in logs (even on Render) to save Fast2SMS balance
    this.logger.log({
      message: `Sending OTP to ${phone}`,
      phone,
      otp: otp, // <-- Exposing OTP in logs for testing on Render
    });

    try {
      /* 
      // Fast2SMS API call commented out to save balance / prevent 400 errors
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
      this.logger.log({
        message: 'Fast2SMS response received',
        response: response.data,
      });
      */
    } catch (err) {
      this.logger.error(
        `Fast2SMS OTP transmission error: ${err.message}`,
        err.stack,
        { errorDetails: err?.response?.data || err.message },
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

  private async enforceOtpRateLimits(phone: string, ip: string): Promise<void> {
    const clientIp = ip || 'unknown';

    // 1. Verification Lockout Check: Check if verification is currently locked due to too many failed attempts
    const lockKey = `otp_verify_attempts:${phone}:lock`;
    const isLocked = await this.cacheService.get<boolean>(lockKey);
    if (isLocked) {
      throw new HttpException(
        {
          success: false,
          message:
            'Too many failed verification attempts. Please try again in 15 minutes.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. IP-based Limit: max 15 requests per hour (sliding window)
    const cacheKeyIp = `otp_rate_limit:ip:${clientIp}`;
    const ipRateLimited = await this.cacheService.checkSlidingWindowLimit(
      cacheKeyIp,
      15,
      60 * 60 * 1000, // 1 hour
    );
    if (ipRateLimited) {
      throw new HttpException(
        {
          success: false,
          message:
            'Too many OTP requests from this IP. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 3. Phone-based Limit: max 50 requests per hour (sliding window) for testing
    const cacheKeyPhone = `otp_rate_limit:phone:${phone}`;
    const phoneRateLimited = await this.cacheService.checkSlidingWindowLimit(
      cacheKeyPhone,
      50,
      60 * 60 * 1000, // 1 hour
    );
    if (phoneRateLimited) {
      throw new HttpException(
        {
          success: false,
          message:
            'Too many OTP requests for this phone. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 4. Cooldown: minimum 60 seconds between consecutive requests
    const cooldownKey = `otp_rate_limit:phone:${phone}:cooldown`;
    const allowedByCooldown = await this.cacheService.setCooldown(
      cooldownKey,
      60 * 1000, // 60 seconds
    );
    if (!allowedByCooldown) {
      throw new HttpException(
        {
          success: false,
          message: 'Please wait 60 seconds before requesting another OTP.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // ─────────────────────────────────────────
  // POST /user/login  or  /owner/login
  // Role is determined by the endpoint, not by the user
  // ─────────────────────────────────────────

  async login(dto: LoginDto, ip: string, userAgent: string, role: Role) {
    const { phone } = dto;

    await this.enforceOtpRateLimits(phone, ip);

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

    await this.cacheService.set(
      `otp:${phone}:login`,
      {
        code: hashedOtp,
        attempts: 0,
        sessionToken,
        lastResentAt: Date.now(),
        resendCount: 0,
      },
      this.OTP_EXPIRY_SECONDS * 1000,
    );

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

    // Check if verification is locked
    const lockKey = `otp_verify_attempts:${phone}:lock`;
    const isLocked = await this.cacheService.get<boolean>(lockKey);
    if (isLocked) {
      throw new HttpException(
        {
          success: false,
          message:
            'Too many failed verification attempts. Please try again in 15 minutes.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

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
      const attemptKey = `otp_verify_attempts:${phone}`;
      const failedAttempts =
        (await this.cacheService.get<number>(attemptKey)) || 0;
      const newFailedAttempts = failedAttempts + 1;

      if (newFailedAttempts >= 5) {
        await this.cacheService.set(lockKey, true, 15 * 60 * 1000); // 15 mins
        await this.cacheService.invalidate(attemptKey);
        await this.cacheService.invalidate(`otp:${phone}:login`);
        throw new HttpException(
          {
            success: false,
            message:
              'Too many failed verification attempts. Verification locked for 15 minutes.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      } else {
        await this.cacheService.set(
          attemptKey,
          newFailedAttempts,
          15 * 60 * 1000,
        );
      }

      if (otpPayload.attempts >= 5) {
        await this.cacheService.invalidate(`otp:${phone}:login`);
        throw new UnauthorizedException(
          'Too many failed attempts. Please login again',
        );
      } else {
        await this.cacheService.set(
          `otp:${phone}:login`,
          otpPayload,
          this.OTP_EXPIRY_SECONDS * 1000,
        );
      }
      throw new UnauthorizedException('Invalid OTP');
    }

    // Clean up OTP and attempts on success
    await this.cacheService.invalidate(`otp:${phone}:login`);
    await this.cacheService.invalidate(`otp_verify_attempts:${phone}`);
    await this.cacheService.invalidate(lockKey);

    // Store verified session token in Redis for deleteAccount check
    await this.cacheService.set(
      `otp:verified:${auth.id}`,
      otpPayload.sessionToken,
      1000 * 60 * 60 * 24,
    ); // 24 hours

    // Authorize MPIN reset for 15 minutes
    await this.cacheService.set(
      `mpin_reset_authorized:${auth.id}`,
      true,
      1000 * 60 * 15,
    );

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

  async resendOtp(dto: ResendOtpDto, ip?: string) {
    const { phone } = dto;

    const auth = await this.prisma.auth.findUnique({
      where: { phone },
    });

    if (!auth) {
      throw new NotFoundException('Account not found');
    }

    await this.enforceOtpRateLimits(phone, ip || '');

    let otpPayload = await this.cacheService.get<{
      code: string;
      attempts: number;
      sessionToken: string;
      lastResentAt: number;
      resendCount: number;
    }>(`otp:${phone}:login`);

    if (otpPayload) {
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
    }

    const otp = this.generateOtp();
    const hashedOtp = await this.hashOtp(otp);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_SECONDS * 1000);

    if (otpPayload) {
      otpPayload.code = hashedOtp;
      otpPayload.attempts = 0;
      otpPayload.lastResentAt = Date.now();
      otpPayload.resendCount++;
    } else {
      otpPayload = {
        code: hashedOtp,
        attempts: 0,
        sessionToken: crypto.randomUUID(),
        lastResentAt: Date.now(),
        resendCount: 1,
      };
    }

    await this.cacheService.set(
      `otp:${phone}:login`,
      otpPayload,
      this.OTP_EXPIRY_SECONDS * 1000,
    );

    await this.sendOtpViaSms(auth.phone, otp);
    this.logger.log({
      event: 'otp_regenerated',
      phone: auth.phone,
      expiresAt,
      role: auth.role,
    });

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

    const verifiedToken = await this.cacheService.get<string>(
      `otp:verified:${authId}`,
    );
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

    const {
      userProfile,
      ownerProfile,
      payment,
      mpinHash,
      mpinCreatedAt,
      mpinUpdatedAt,
      mpinLockedUntil,
      failedMpinAttempts,
      ...authData
    } = auth;
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

    // Include phone number and MPIN status in the result
    const result = {
      success: true,
      data: {
        ...authData,
        phone: auth.phone,
        isMpinSet: !!mpinHash,
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

  async requestPhoneChange(authId: string, newPhone: string, ip?: string) {
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

    await this.enforceOtpRateLimits(newPhone, ip || '');

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

    await this.cacheService.set(
      `otp:${authId}:phone-change`,
      otpPayload,
      this.OTP_EXPIRY_SECONDS * 1000,
    );

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
    // Check if verification is locked
    const lockKey = `otp_verify_attempts:${newPhone}:lock`;
    const isLocked = await this.cacheService.get<boolean>(lockKey);
    if (isLocked) {
      throw new HttpException(
        {
          success: false,
          message:
            'Too many failed verification attempts. Please try again in 15 minutes.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

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
      const attemptKey = `otp_verify_attempts:${newPhone}`;
      const failedAttempts =
        (await this.cacheService.get<number>(attemptKey)) || 0;
      const newFailedAttempts = failedAttempts + 1;

      if (newFailedAttempts >= 5) {
        await this.cacheService.set(lockKey, true, 15 * 60 * 1000); // 15 mins
        await this.cacheService.invalidate(attemptKey);
        await this.cacheService.invalidate(`otp:${authId}:phone-change`);
        throw new HttpException(
          {
            success: false,
            message:
              'Too many failed verification attempts. Verification locked for 15 minutes.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      } else {
        await this.cacheService.set(
          attemptKey,
          newFailedAttempts,
          15 * 60 * 1000,
        );
      }

      if (otpPayload.attempts >= 5) {
        await this.cacheService.invalidate(`otp:${authId}:phone-change`);
        throw new UnauthorizedException(
          'Too many failed attempts. Please request again',
        );
      } else {
        await this.cacheService.set(
          `otp:${authId}:phone-change`,
          otpPayload,
          this.OTP_EXPIRY_SECONDS * 1000,
        );
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

    // Clean up OTP and attempts on success
    await this.cacheService.invalidate(`otp:${authId}:phone-change`);
    await this.cacheService.invalidate(`otp_verify_attempts:${newPhone}`);
    await this.cacheService.invalidate(lockKey);

    // Store verified session token in Redis for deleteAccount check
    await this.cacheService.set(
      `otp:verified:${authId}`,
      sessionToken,
      1000 * 60 * 60 * 24,
    ); // 24 hours

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

  // ─────────────────────────────────────────
  // MPIN methods
  // ─────────────────────────────────────────

  async createMpin(authId: string, dto: CreateMpinDto) {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
    });
    if (!auth) throw new NotFoundException('Account not found');

    if (auth.mpinHash) {
      throw new ConflictException(
        'MPIN is already set up. Use change-mpin to update it.',
      );
    }

    const hashedMpin = await bcrypt.hash(dto.mpin, 10);
    await this.prisma.auth.update({
      where: { id: authId },
      data: {
        mpinHash: hashedMpin,
        mpinCreatedAt: new Date(),
        mpinUpdatedAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'MPIN created successfully',
    };
  }

  async verifyMpin(authId: string, dto: VerifyMpinDto) {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
    });
    if (!auth) throw new NotFoundException('Account not found');

    if (!auth.mpinHash) {
      throw new BadRequestException('MPIN is not set up');
    }

    const now = new Date();
    if (auth.mpinLockedUntil && auth.mpinLockedUntil > now) {
      const remainingMs = auth.mpinLockedUntil.getTime() - now.getTime();
      const remainingMins = Math.ceil(remainingMs / (60 * 1000));
      throw new BadRequestException(
        `MPIN verification is locked. Please try again after ${remainingMins} minutes.`,
      );
    }

    const isValid = await bcrypt.compare(dto.mpin, auth.mpinHash);
    if (!isValid) {
      const attempts = auth.failedMpinAttempts + 1;
      let lockedUntil: Date | null = null;
      let message = 'Invalid MPIN';

      if (attempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        message =
          'MPIN locked due to too many failed attempts. Try again in 15 minutes.';
      }

      await this.prisma.auth.update({
        where: { id: authId },
        data: {
          failedMpinAttempts: attempts >= 5 ? 5 : attempts,
          mpinLockedUntil: lockedUntil,
        },
      });

      this.logger.warn({
        message: `Failed MPIN attempt for user ${authId}`,
        userId: authId,
        attempts,
        locked: !!lockedUntil,
      });

      throw new UnauthorizedException(message);
    }

    // Reset failed attempts on success
    if (auth.failedMpinAttempts > 0 || auth.mpinLockedUntil) {
      await this.prisma.auth.update({
        where: { id: authId },
        data: {
          failedMpinAttempts: 0,
          mpinLockedUntil: null,
        },
      });
    }

    return {
      success: true,
      message: 'MPIN verified successfully',
    };
  }

  async changeMpin(authId: string, dto: ChangeMpinDto) {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
    });
    if (!auth) throw new NotFoundException('Account not found');

    if (!auth.mpinHash) {
      throw new BadRequestException(
        'MPIN is not set up. Please create one first.',
      );
    }

    // First check if locked
    const now = new Date();
    if (auth.mpinLockedUntil && auth.mpinLockedUntil > now) {
      const remainingMs = auth.mpinLockedUntil.getTime() - now.getTime();
      const remainingMins = Math.ceil(remainingMs / (60 * 1000));
      throw new BadRequestException(
        `MPIN verification is locked. Please try again after ${remainingMins} minutes.`,
      );
    }

    // Verify current MPIN
    const isValid = await bcrypt.compare(dto.currentMpin, auth.mpinHash);
    if (!isValid) {
      const attempts = auth.failedMpinAttempts + 1;
      let lockedUntil: Date | null = null;
      let message = 'Invalid current MPIN';

      if (attempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        message =
          'MPIN locked due to too many failed attempts. Try again in 15 minutes.';
      }

      await this.prisma.auth.update({
        where: { id: authId },
        data: {
          failedMpinAttempts: attempts >= 5 ? 5 : attempts,
          mpinLockedUntil: lockedUntil,
        },
      });

      this.logger.warn({
        message: `Failed current MPIN verification during change-mpin for user ${authId}`,
        userId: authId,
        attempts,
        locked: !!lockedUntil,
      });

      throw new UnauthorizedException(message);
    }

    // Hash and store the new MPIN
    const hashedNewMpin = await bcrypt.hash(dto.newMpin, 10);
    await this.prisma.auth.update({
      where: { id: authId },
      data: {
        mpinHash: hashedNewMpin,
        mpinUpdatedAt: new Date(),
        failedMpinAttempts: 0,
        mpinLockedUntil: null,
      },
    });

    return {
      success: true,
      message: 'MPIN changed successfully',
    };
  }

  async resetMpin(authId: string, dto: ResetMpinDto) {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
    });
    if (!auth) throw new NotFoundException('Account not found');

    // Check if user has successfully verified OTP recently (within 15 minutes)
    const authorized = await this.cacheService.get<boolean>(
      `mpin_reset_authorized:${authId}`,
    );
    if (!authorized) {
      throw new ForbiddenException(
        'OTP verification is required before resetting MPIN',
      );
    }

    // Hash and store the new MPIN
    const hashedNewMpin = await bcrypt.hash(dto.newMpin, 10);
    await this.prisma.auth.update({
      where: { id: authId },
      data: {
        mpinHash: hashedNewMpin,
        mpinUpdatedAt: new Date(),
        failedMpinAttempts: 0,
        mpinLockedUntil: null,
      },
    });

    // Clean up the authorization flag on success
    await this.cacheService.invalidate(`mpin_reset_authorized:${authId}`);

    return {
      success: true,
      message: 'MPIN reset successfully',
    };
  }
}
