import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

/**
 * Production-ready Redis-backed sliding window rate limiter.
 * Keys are formatted as: `rate_limit:${identifier}:${endpoint}`
 */
@Injectable()
export class RateLimiterService {
  constructor(private readonly redisService: RedisService) {}

  /**
   * Check rate limit. Throws 429 if exceeded.
   * @param key - unique identifier (userId:endpoint or ip:endpoint or bookingId:endpoint)
   * @param config - { limit, windowMs }
   */
  async check(key: string, config: RateLimitConfig): Promise<void> {
    const redisKey = `rate_limit:${key}`;
    const count = await this.redisService.incrementRateLimit(
      redisKey,
      config.windowMs,
    );

    if (count > config.limit) {
      // Get remaining TTL to compute Retry-After header
      // Note: pTtl gets time in ms.
      let retryAfterSeconds = Math.ceil(config.windowMs / 1000);
      try {
        // Access raw client to get precise TTL if needed
        const ttlMs = await (this.redisService as any).client.pTtl(redisKey);
        if (ttlMs > 0) {
          retryAfterSeconds = Math.ceil(ttlMs / 1000);
        }
      } catch {
        // Fallback to full window duration
      }

      throw new HttpException(
        {
          success: false,
          message: 'Too many requests. Try later.',
          retryAfter: retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Get remaining attempts for a key (useful for PIN lockout tracking)
   */
  async getCount(key: string): Promise<number> {
    const redisKey = `rate_limit:${key}`;
    return this.redisService.getRateLimitCount(redisKey);
  }
}

/**
 * Rate limit configurations per endpoint (Layer 6 spec)
 */
export const RATE_LIMITS = {
  CREATE_BOOKING: { limit: 5, windowMs: 10 * 60 * 1000 }, // 5 req/user/10min
  CREATE_ORDER: { limit: 3, windowMs: 5 * 60 * 1000 }, // 3 req/booking/5min
  CONFIRM_PAYMENT: { limit: 3, windowMs: 5 * 60 * 1000 }, // 3 req/booking/5min
  PAYMENT_FAILED: { limit: 5, windowMs: 10 * 60 * 1000 }, // 5 req/user/10min
  VERIFY_PIN: { limit: 5, windowMs: 15 * 60 * 1000 }, // 5 req/booking/15min
  CANCEL: { limit: 3, windowMs: 10 * 60 * 1000 }, // 3 req/user/10min
  RATE_TURF: { limit: 1, windowMs: Number.MAX_SAFE_INTEGER }, // lifetime (DB check)
  CRON: { limit: 1, windowMs: 4 * 60 * 1000 }, // 1 req/endpoint/4min
  AVAILABILITY: { limit: 30, windowMs: 60 * 1000 }, // 30 req/user/1min
  UPLOAD_AVATAR: { limit: 10, windowMs: 60 * 60 * 1000 }, // 10 req/user/1hour
} as const;
