import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { MetricsService } from '../metrics/metrics.service';
import { CACHE_TTL } from '../redis/redis.constants';

/**
 * Production-ready Cache Service wrapping Redis.
 *
 * Uses RedisService for key/value cache storage.
 * Maintains exact same API signatures, now returns Promises.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly promiseMap = new Map<string, Promise<any>>();

  constructor(
    private readonly redisService: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Get a cached value by key.
   */
  async get<T>(key: string): Promise<T | undefined> {
    const val = await this.redisService.get<T>(key);
    return val === null ? undefined : val;
  }

  /**
   * Set a cached value with optional custom TTL (in ms).
   */
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttl = ttlMs !== undefined ? ttlMs : CACHE_TTL.DEFAULT;
    await this.redisService.set(key, value, ttl);
  }

  /**
   * Invalidate a specific cache key.
   */
  async invalidate(key: string): Promise<void> {
    await this.redisService.del(key);
  }

  /**
   * Invalidate all keys matching a prefix.
   */
  async invalidatePrefix(prefix: string): Promise<void> {
    await this.redisService.invalidatePrefix(prefix);
  }

  /**
   * Check if a sliding window rate limit is exceeded.
   * Returns true if rate limited, false if allowed.
   */
  async checkSlidingWindowLimit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    return this.redisService.checkSlidingWindowLimit(key, limit, windowMs);
  }

  /**
   * Set a cooldown key with TTL.
   * Returns true if the cooldown was successfully set (allowed to proceed).
   * Returns false if the cooldown key was already present (blocked).
   */
  async setCooldown(key: string, cooldownMs: number): Promise<boolean> {
    return this.redisService.setCooldown(key, cooldownMs);
  }

  /**
   * Get or compute: returns cached value if available,
   * otherwise calls factory, caches the result, and returns it.
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      this.metrics.cacheHitTotal.inc();
      return cached;
    }

    this.metrics.cacheMissTotal.inc();

    if (this.promiseMap.has(key)) {
      return this.promiseMap.get(key);
    }

    const promise = factory()
      .then(async (value) => {
        await this.set(key, value, ttlMs);
        this.promiseMap.delete(key);
        return value;
      })
      .catch((err) => {
        this.promiseMap.delete(key);
        throw err;
      });

    this.promiseMap.set(key, promise);
    return promise;
  }

  /**
   * Get cache statistics for monitoring.
   */
  async getStats() {
    const info = await this.redisService.getHealthInfo();
    return {
      size: info.dbSize,
      maxSize: 'unlimited',
      connected: info.connected,
    };
  }
}
