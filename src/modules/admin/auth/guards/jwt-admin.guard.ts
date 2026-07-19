import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class JwtAdminGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }
    const token = authHeader.split(' ')[1];
    try {
      const secret =
        this.configService.get<string>('JWT_ACCESS_SECRET') ||
        'your_access_secret_2709';
      const payload = this.jwtService.verify(token, { secret });
      if (!payload.adminId) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // Verify the session in the database
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const session = await this.prisma.adminSession.findUnique({
        where: { tokenHash },
        include: { admin: true },
      });

      if (
        !session ||
        session.revokedAt ||
        new Date() > session.expiresAt ||
        !session.admin.isActive
      ) {
        throw new UnauthorizedException('Session expired or revoked');
      }

      request.user = {
        adminId: session.admin.id,
        email: session.admin.email,
        name: session.admin.name,
        role: session.admin.role,
        token,
      };
      return true;
    } catch (err) {
      throw new UnauthorizedException(
        err.message || 'Unauthorized admin access',
      );
    }
  }
}
