import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * CronGuard — protects cron endpoints with X-Cron-Secret header.
 * Skips JWT entirely. Only validates the shared secret.
 */
@Injectable()
export class CronGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const cronSecret = request.headers['x-cron-secret'];
    const expectedSecret = this.configService.get<string>('CRON_SECRET');

    if (!expectedSecret) {
      console.error('[SECURITY] CRON_SECRET not configured in environment');
      throw new UnauthorizedException('Authentication required.');
    }

    if (!cronSecret || cronSecret !== expectedSecret) {
      const ip = request.ip || request.connection?.remoteAddress || 'unknown';
      console.error(
        `[SECURITY ALERT] Cron secret mismatch from IP: ${ip} at ${new Date().toISOString()}`,
      );
      throw new UnauthorizedException('Authentication required.');
    }

    return true;
  }
}
