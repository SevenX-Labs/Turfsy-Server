import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminLoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: AdminLoginDto, ipAddress: string, userAgent: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!admin.isActive) {
      throw new ForbiddenException('Admin account is suspended');
    }

    if (admin.lockedUntil && new Date() < admin.lockedUntil) {
      throw new ForbiddenException('Admin account is temporarily locked due to too many failed attempts');
    }

    const isMatch = await bcrypt.compare(dto.password, admin.passwordHash);
    if (!isMatch) {
      const failedAttempts = admin.failedAttempts + 1;
      let lockedUntil: Date | null = null;
      if (failedAttempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins lock
      }
      await this.prisma.admin.update({
        where: { id: admin.id },
        data: {
          failedAttempts,
          lockedUntil,
        },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    // Reset failed attempts
    await this.prisma.admin.update({
      where: { id: admin.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
      },
    });

    // Generate token
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET') || 'your_access_secret_2709';
    const expiresIn = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '24h';
    
    const payload = { adminId: admin.id, email: admin.email, role: admin.role };
    const token = this.jwtService.sign(payload, { secret, expiresIn: expiresIn as any });

    // Create session in database
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // match 24h

    await this.prisma.adminSession.create({
      data: {
        adminId: admin.id,
        tokenHash,
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    // Record action log
    await this.prisma.adminActionLog.create({
      data: {
        adminId: admin.id,
        action: 'ADMIN_CREATED', // we can log login here, or define actions
        targetType: 'Admin',
        targetId: admin.id,
        reason: 'Successful Login',
        ipAddress,
        metadata: { userAgent },
      },
    });

    return {
      accessToken: token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    };
  }

  async logout(token: string, adminId: string, ipAddress: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await this.prisma.adminSession.updateMany({
      where: { tokenHash },
      data: { revokedAt: new Date() },
    });

    // Record action log
    await this.prisma.adminActionLog.create({
      data: {
        adminId,
        action: 'ADMIN_DEACTIVATED', // we can use existing AdminActionType or logs
        targetType: 'Admin',
        targetId: adminId,
        reason: 'Successful Logout',
        ipAddress,
      },
    });

    return { success: true };
  }
}
