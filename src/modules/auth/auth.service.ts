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
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

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
    // DEV MODE — replace with real SMS provider in production
    console.log(`[OTP] Phone: ${phone} | OTP: ${otp}`);
  }

  private generateSessionToken(authId: string, sessionId: string, role: Role) {
    return this.jwtService.sign({ authId, sessionId, role });
  }

  // ─────────────────────────────────────────
  // POST /login
  // ─────────────────────────────────────────

  async login(dto: LoginDto, ip: string, userAgent: string) {
    const { phone, role } = dto;

    // Upsert auth record
    const auth = await this.prisma.auth.upsert({
      where: { phone },
      update: { role },
      create: { phone, role },
    });

    if (!auth.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Generate OTP
    const otp = this.generateOtp();
    const hashedOtp = await this.hashOtp(otp);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_SECONDS * 1000);

    // Create OtpEntry
    const otpEntry = await this.prisma.otpEntry.create({
      data: {
        authId: auth.id,
        code: hashedOtp,
        expiresAt,
      },
    });

    // Send OTP
    await this.sendOtpViaSms(phone, otp);

    return {
      success: true,
      message: 'OTP sent successfully',
      sessionToken: otpEntry.sessionToken,
      expiresIn: this.OTP_EXPIRY_SECONDS,
    };
  }

  // ─────────────────────────────────────────
  // POST /verify-otp
  // ─────────────────────────────────────────

  async verifyOtp(dto: VerifyOtpDto) {
    const { phone, otp } = dto;

    // Find auth by phone
    const authRecord = await this.prisma.auth.findUnique({ where: { phone } });
    if (!authRecord) {
      throw new NotFoundException('Phone number not registered');
    }

    // Get latest unverified OtpEntry for this auth
    const otpEntry = await this.prisma.otpEntry.findFirst({
      where: {
        authId: authRecord.id,
        verifiedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: { auth: true },
    });

    if (!otpEntry) {
      throw new NotFoundException('No active OTP found. Please request a new one');
    }

    if (otpEntry.verifiedAt) {
      throw new ConflictException('OTP already used');
    }

    if (new Date() > otpEntry.expiresAt) {
      throw new BadRequestException('OTP expired');
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

    // Create session
    const expiresAt = new Date(
      Date.now() + parseInt(this.config.get('SESSION_EXPIRY_DAYS', '7')) * 86400000,
    );

    const session = await this.prisma.session.create({
      data: {
        authId: otpEntry.authId,
        expiresAt,
      },
    });

    // Mark auth as verified
    await this.prisma.auth.update({
      where: { id: otpEntry.authId },
      data: { isVerified: true },
    });

    // Create profile if first time
    const auth = otpEntry.auth;
    await this.createProfileIfNotExists(auth.id, auth.role);

    // Sign JWT
    const token = this.generateSessionToken(auth.id, session.id, auth.role);

    return {
      success: true,
      message: 'Login successful',
      accessToken: token,
      role: auth.role,
    };
  }

  // ─────────────────────────────────────────
  // POST /resend-otp
  // ─────────────────────────────────────────

  async resendOtp(dto: ResendOtpDto) {
    const { sessionToken } = dto;

    const otpEntry = await this.prisma.otpEntry.findUnique({
      where: { sessionToken },
      include: { auth: true },
    });

    if (!otpEntry) {
      throw new NotFoundException('Invalid session token');
    }

    if (otpEntry.verifiedAt) {
      throw new ConflictException('OTP already verified');
    }

    // Rate limit check — 1 req per 60s
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

    // Generate new OTP
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

    await this.sendOtpViaSms(otpEntry.auth.phone, otp);

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

    // Require OTP re-verification for account deletion
    const otpEntry = await this.prisma.otpEntry.findFirst({
      where: {
        authId,
        verifiedAt: { not: null },
      },
      orderBy: { verifiedAt: 'desc' },
    });

    if (!otpEntry) {
      throw new UnauthorizedException('Please verify OTP before deleting account');
    }

    // Soft delete — revoke all sessions + mark deletedAt
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { authId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auth.update({
        where: { id: authId },
        data: { deletedAt: new Date(), isActive: false },
      }),
    ]);

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
        ownerProfile: {
          include: { turfs: true },
        },
        payment: true,
      },
    });

    if (!auth || !auth.isActive) {
      throw new NotFoundException('User not found');
    }

    const { userProfile, ownerProfile, payment, ...authData } = auth;
    const profile = auth.role === Role.OWNER ? ownerProfile : userProfile;

    return {
      success: true,
      data: {
        ...authData,
        profile,
        payment,
      },
    };
  }

  // ─────────────────────────────────────────
  // Internal — create profile on first login
  // ─────────────────────────────────────────

  private async createProfileIfNotExists(authId: string, role: Role) {
    if (role === Role.USER) {
      const exists = await this.prisma.userProfile.findUnique({ where: { authId } });
      if (!exists) {
        await this.prisma.userProfile.create({
          data: {
            authId,
            name: '',
            email: '',
            avatarUrl: '',
            dob: new Date(),
            gender: 'PREFER_NOT_TO_SAY' as any,
          },
        });
      }
    } else if (role === Role.OWNER) {
      const exists = await this.prisma.ownerProfile.findUnique({ where: { authId } });
      if (!exists) {
        await this.prisma.ownerProfile.create({
          data: {
            authId,
            name: '',
            email: '',
            contactNumber: '',
            avatarUrl: '',
            aadharNumber: '',
          },
        });
      }
    }
  }
}