import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * CronGuard — protects cron endpoints with X-Cron-Secret header.
 * Skips JWT entirely. Only validates the shared secret.
 */
@Injectable()
export class CronGuard implements CanActivate {
  private readonly logger = new Logger(CronGuard.name);
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const cronSecret = request.headers['x-cron-secret'];
    const expectedSecret = this.configService.get<string>('CRON_SECRET');

    if (!expectedSecret) {
      this.logger.error('CRON_SECRET not configured in environment');
      throw new UnauthorizedException('Authentication required.');
    }

    if (!cronSecret || cronSecret !== expectedSecret) {
      const ip = request.ip || request.connection?.remoteAddress || 'unknown';
      this.logger.warn(`Cron secret mismatch from IP: ${ip}`);
      throw new UnauthorizedException('Authentication required.');
    }

    return true;
  }
}
