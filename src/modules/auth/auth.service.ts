import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import axios from 'axios';

@Injectable()
export class AuthService {
  private readonly OTP_EXPIRY_SECONDS = 60;
  private readonly RESEND_LIMIT_SECONDS = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
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
    console.log(`[OTP] Phone: ${phone} | OTP: ${otp}`);
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
      console.log(`[Fast2SMS] Response:`, response.data);
    } catch (err) {
      console.error(`[Fast2SMS] Error:`, JSON.stringify(err?.response?.data || err.message));
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

    // Invalidate all previous unverified OTPs
    await this.prisma.otpEntry.deleteMany({
      where: { authId: auth.id, verifiedAt: null },
    });

    const otp = this.generateOtp();
    const hashedOtp = await this.hashOtp(otp);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_SECONDS * 1000);

    await this.prisma.otpEntry.create({
      data: { authId: auth.id, code: hashedOtp, expiresAt },
    });

    await this.sendOtpViaSms(phone, otp);

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

    const otpEntry = await this.prisma.otpEntry.findFirst({
      where: { authId: auth.id, verifiedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpEntry) {
      throw new NotFoundException('Invalid or expired OTP request. Please login again');
    }

    if (otpEntry.verifiedAt) {
      throw new ConflictException('OTP already used');
    }

    if (new Date() > otpEntry.expiresAt) {
      throw new BadRequestException('OTP expired. Please request a new one');
    }

    const isValid = await bcrypt.compare(otp, otpEntry.code);
    if (!isValid) {
      throw new UnauthorizedException('Invalid OTP');
    }

    // Mark OTP as verified
    await this.prisma.otpEntry.update({
      where: { id: otpEntry.id },
      data: { verifiedAt: new Date() },
    });

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
    const isNewUser = role === Role.USER ? !auth.userProfile : !auth.ownerProfile;

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

    const otpEntry = await this.prisma.otpEntry.findFirst({
      where: { authId: auth.id, verifiedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpEntry) {
      throw new NotFoundException('Invalid OTP request');
    }

    if (otpEntry.verifiedAt) {
      throw new ConflictException('OTP already verified');
    }

    if (otpEntry.lastResentAt) {
      const diff = (Date.now() - otpEntry.lastResentAt.getTime()) / 1000;
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

    await this.prisma.otpEntry.update({
      where: { id: otpEntry.id },
      data: {
        code: hashedOtp,
        expiresAt,
        lastResentAt: new Date(),
        resendCount: { increment: 1 },
      },
    });

    await this.sendOtpViaSms(auth.phone, otp);

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
      throw new UnauthorizedException('Session not found or already logged out');
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

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

    const otpEntry = await this.prisma.otpEntry.findFirst({
      where: { authId, verifiedAt: { not: null } },
      orderBy: { verifiedAt: 'desc' },
    });

    if (!otpEntry) {
      throw new UnauthorizedException('Please verify OTP before deleting account');
    }

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
      await tx.slotLock.deleteMany({
        where: { userId: authId },
      });

      // Remove slot locks against owner's turfs (if owner account)
      if (ownerTurfIds.length > 0) {
        await tx.slotLock.deleteMany({
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
  // GET /get-me
  // ─────────────────────────────────────────

  async getMe(authId: string) {
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
    let profile: Record<string, any> | null = auth.role === Role.OWNER ? ownerProfile : userProfile;

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
    return {
      success: true,
      data: {
        ...authData,
        phone: auth.phone,
        profile,
        payment,
      },
    };
  }

  // ─────────────────────────────────────────
  // POST /request-phone-change (authenticated)
  // Sends OTP to the NEW phone number
  // ─────────────────────────────────────────

  async requestPhoneChange(authId: string, newPhone: string) {
    const auth = await this.prisma.auth.findUnique({ where: { id: authId } });
    if (!auth) throw new NotFoundException('Account not found');
    if (!auth.isActive) throw new UnauthorizedException('Account is deactivated');

    // New phone must not already be registered
    const existing = await this.prisma.auth.findUnique({ where: { phone: newPhone } });
    if (existing && existing.id !== authId) {
      throw new ConflictException('This phone number is already registered to another account');
    }

    // Invalidate any pending OTPs
    await this.prisma.otpEntry.deleteMany({
      where: { authId, verifiedAt: null },
    });

    const otp = this.generateOtp();
    const hashedOtp = await this.hashOtp(otp);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_SECONDS * 1000);

    const otpEntry = await this.prisma.otpEntry.create({
      data: { authId, code: hashedOtp, expiresAt },
    });

    await this.sendOtpViaSms(newPhone, otp);

    return {
      success: true,
      message: `OTP sent to ${newPhone}`,
      sessionToken: otpEntry.sessionToken,
      newPhone,
      expiresIn: this.OTP_EXPIRY_SECONDS,
    };
  }

  // ─────────────────────────────────────────
  // POST /verify-phone-change (authenticated)
  // Verifies OTP + updates phone in Auth
  // ─────────────────────────────────────────

  async verifyPhoneChange(authId: string, sessionToken: string, newPhone: string, otp: string) {
    const auth = await this.prisma.auth.findUnique({ where: { id: authId } });
    if (!auth) throw new NotFoundException('Account not found');

    const otpEntry = await this.prisma.otpEntry.findUnique({
      where: { sessionToken },
    });

    if (!otpEntry || otpEntry.authId !== authId) {
      throw new NotFoundException('Invalid session token');
    }
    if (otpEntry.verifiedAt) throw new ConflictException('OTP already used');
    if (new Date() > otpEntry.expiresAt) throw new BadRequestException('OTP expired');

    const isValid = await bcrypt.compare(otp, otpEntry.code);
    if (!isValid) throw new UnauthorizedException('Invalid OTP');

    // Double-check new phone is still available
    const taken = await this.prisma.auth.findUnique({ where: { phone: newPhone } });
    if (taken && taken.id !== authId) {
      throw new ConflictException('This phone number is already registered to another account');
    }

    // Mark OTP verified + update phone atomically
    await this.prisma.$transaction([
      this.prisma.otpEntry.update({
        where: { id: otpEntry.id },
        data: { verifiedAt: new Date() },
      }),
      this.prisma.auth.update({
        where: { id: authId },
        data: { phone: newPhone },
      }),
    ]);

    return {
      success: true,
      message: 'Phone number updated successfully',
      data: { phone: newPhone },
    };
  }
}
