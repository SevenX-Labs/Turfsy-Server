import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

interface RateLimitEntry {
  count: number;
  resetAt: number; // Unix timestamp ms
}

interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

/**
 * In-memory sliding window rate limiter.
 * In production, replace with Redis-backed implementation.
 * Keys are formatted as: `${identifier}:${endpoint}`
 */
@Injectable()
export class RateLimiterService {
  private store = new Map<string, RateLimitEntry>();

  // Cleanup interval — remove expired entries every 60s
  constructor() {
    setInterval(() => this.cleanup(), 60_000);
  }

  /**
   * Check rate limit. Throws 429 if exceeded.
   * @param key - unique identifier (userId:endpoint or ip:endpoint or bookingId:endpoint)
   * @param config - { limit, windowMs }
   */
  check(key: string, config: RateLimitConfig): void {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      // Start new window
      this.store.set(key, {
        count: 1,
        resetAt: now + config.windowMs,
      });
      return;
    }

    entry.count++;

    if (entry.count > config.limit) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
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
  getCount(key: string): number {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.resetAt) return 0;
    return entry.count;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetAt) {
        this.store.delete(key);
      }
    }
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
