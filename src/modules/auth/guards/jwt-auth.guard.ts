import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { LRUCache } from 'lru-cache';

const sessionCache = new LRUCache<string, string>({
  max: 5000,
  ttl: 1000 * 60 * 5,
});

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = this.getRequest(context);
    const token = this.extractToken(request);
    const payload = this.verifyToken(token);
    await this.ensureSessionValid(payload.sessionId);

    request.user = payload;
    return true;
  }

  protected getRequest(context: ExecutionContext) {
    return context.switchToHttp().getRequest();
  }

  protected extractToken(request: any) {
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid authorization header',
      );
    }
    return authHeader.split(' ')[1];
  }

  protected verifyToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  protected async ensureSessionValid(sessionId: string) {
    const cachedStatus = sessionCache.get(sessionId);
    if (cachedStatus === 'valid') {
      return;
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new UnauthorizedException('Session not found');
    }
    if (session.revokedAt) {
      throw new UnauthorizedException('Session has been revoked');
    }
    const now = new Date();
    if (now > session.expiresAt) {
      throw new UnauthorizedException('Session expired due to inactivity');
    }

    sessionCache.set(sessionId, 'valid');

    // Rolling window: Extend session if more than 1 day has passed since last update
    // This implements the "30 days inactivity = logout" rule automatically
    const msIn30Days = 30 * 24 * 60 * 60 * 1000;
    const msIn29Days = 29 * 24 * 60 * 60 * 1000;

    if (session.expiresAt.getTime() - now.getTime() < msIn29Days) {
      this.prisma.session
        .update({
          where: { id: sessionId },
          data: { expiresAt: new Date(now.getTime() + msIn30Days) },
        })
        .catch((err) =>
          console.error(
            '[AUTH] Failed to update session activity:',
            err.message,
          ),
        );
    }
  }
}
