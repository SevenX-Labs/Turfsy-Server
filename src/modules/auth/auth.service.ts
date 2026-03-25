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
        'https://control.msg91.com/api/v5/otp',
        {
          template_id: this.config.get<string>('MSG91_TEMPLATE_ID'),
          mobile: `91${phone}`,
          otp: otp,
        },
        {
          headers: {
            authkey: this.config.get<string>('MSG91_AUTH_KEY'),
            'Content-Type': 'application/json',
          },
        },
      );
      console.log(`[MSG91] Response:`, response.data);
    } catch (err) {
      console.error(`[MSG91] Error:`, JSON.stringify(err?.response?.data || err.message));
    }
  }

  private generateSessionToken(authId: string, sessionId: string, role: Role) {
    return this.jwtService.sign({ authId, sessionId, role });
  }

  // ─────────────────────────────────────────
  // POST /login
  // ─────────────────────────────────────────

  async login(dto: LoginDto, ip: string, userAgent: string) {
    const { phone } = dto;

    let auth = await this.prisma.auth.findUnique({ where: { phone } });
    if (!auth) {
      auth = await this.prisma.auth.create({ data: { phone } });
    }

    if (!auth.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Invalidate all previous unverified OTPs for this account
    // so old sessionTokens can never be reused
    await this.prisma.otpEntry.deleteMany({
      where: { authId: auth.id, verifiedAt: null },
    });

    const otp = this.generateOtp();
    const hashedOtp = await this.hashOtp(otp);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_SECONDS * 1000);

    const otpEntry = await this.prisma.otpEntry.create({
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
  // POST /verify-otp
  // ─────────────────────────────────────────

  async verifyOtp(dto: VerifyOtpDto) {
    const { phone, otp } = dto;

    const auth = await this.prisma.auth.findUnique({
      where: { phone },
    });

    if (!auth) {
      throw new NotFoundException('Account not found');
    }

    const otpEntry = await this.prisma.otpEntry.findFirst({
      where: { authId: auth.id, verifiedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { auth: true },
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

    // Create session
    const expiresAt = new Date(
      Date.now() + parseInt(this.config.get('SESSION_EXPIRY_DAYS', '7')) * 86400000,
    );
    const session = await this.prisma.session.create({
      data: { authId: otpEntry.authId, expiresAt },
    });

    // Mark auth as verified
    await this.prisma.auth.update({
      where: { id: otpEntry.authId },
      data: { isVerified: true },
    });

    // Issue JWT with the verified auth's role
    const token = this.generateSessionToken(otpEntry.auth.id, session.id, otpEntry.auth.role);

    return {
      success: true,
      message: 'OTP verified successfully',
      accessToken: token,
    };
  }

  // ─────────────────────────────────────────
  // POST /select-role — set role, return profile
  // ─────────────────────────────────────────

  async selectRole(authId: string, role: Role) {
    const auth = await this.prisma.auth.findUnique({
      where: { id: authId },
      include: { userProfile: true, ownerProfile: true },
    });

    if (!auth) throw new NotFoundException('Account not found');
    if (!auth.isActive) throw new UnauthorizedException('Account is deactivated');

    // Update role in DB
    await this.prisma.auth.update({
      where: { id: authId },
      data: { role },
    });

    // isNewUser = true if profile has no name yet
    const isNewUser =
      role === Role.USER
        ? !auth.userProfile || !auth.userProfile.name
        : !auth.ownerProfile || !auth.ownerProfile.name;

    // Create empty profile row if first time
    await this.createProfileIfNotExists(authId, role);

    // Fetch full profile for returning users
    let profile: Record<string, any> | null = null;
    if (!isNewUser) {
      profile =
        role === Role.USER
          ? await this.prisma.userProfile.findUnique({ where: { authId }, include: { payment: true } })
          : await this.prisma.ownerProfile.findUnique({ where: { authId }, include: { turfs: true, payment: true } });
    }

    return {
      success: true,
      message: isNewUser ? 'Welcome! Please complete your profile.' : 'Welcome back!',
      role,
      isNewUser,
      profile: profile ?? null,
    };
  }

  // ─────────────────────────────────────────
  // POST /resend-otp
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
      include: { auth: true },
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

    const otpEntry = await this.prisma.otpEntry.findFirst({
      where: { authId, verifiedAt: { not: null } },
      orderBy: { verifiedAt: 'desc' },
    });

    if (!otpEntry) {
      throw new UnauthorizedException('Please verify OTP before deleting account');
    }

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

  // Create empty profile row on first login
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

    // Store new phone temporarily in the OTP entry sessionToken metadata
    // by creating OTP entry and returning the sessionToken + newPhone context
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