import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
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
    const envEmail = this.configService.get<string>('ADMIN_EMAIL');
    const envPassword = this.configService.get<string>('ADMIN_PASSWORD');

    if (!envEmail || !envPassword) {
      throw new UnauthorizedException(
        'Admin credentials are not configured on the server',
      );
    }

    // 1. Verify credentials purely against ENV variables
    if (
      dto.email.toLowerCase().trim() !== envEmail.toLowerCase().trim() ||
      dto.password !== envPassword
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. Find or create admin by the exact ENV email (avoids unique constraint conflicts)
    const passwordHash = await bcrypt.hash(envPassword, 10);
    const admin = await this.prisma.admin.upsert({
      where: { email: envEmail.toLowerCase().trim() },
      update: {
        passwordHash,
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
        role: 'SUPER_ADMIN',
        isActive: true,
      },
      create: {
        email: envEmail.toLowerCase().trim(),
        passwordHash,
        name: 'Super Admin',
        role: 'SUPER_ADMIN',
        isActive: true,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
      },
    });

    if (!admin.isActive) {
      throw new ForbiddenException('Admin account is suspended');
    }

    // 3. Generate JWT token
    const secret =
      this.configService.get<string>('JWT_ACCESS_SECRET') ||
      'your_access_secret_2709';
    const expiresIn =
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '24h';

    const payload = { adminId: admin.id, email: admin.email, role: admin.role };
    const token = this.jwtService.sign(payload, {
      secret,
      expiresIn: expiresIn as any,
    });

    // 4. Create session in database
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.adminSession.create({
      data: {
        adminId: admin.id,
        tokenHash,
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    // 5. Record action log
    await this.prisma.adminActionLog.create({
      data: {
        adminId: admin.id,
        action: 'ADMIN_CREATED',
        targetType: 'Admin',
        targetId: admin.id,
        reason: 'Successful Login via ENV verification',
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
