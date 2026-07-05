import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import type { RedisClientType } from 'redis';
import * as crypto from 'crypto';
import { REDIS_CLIENT, CACHE_TTL } from './redis.constants';
import { MetricsService } from '../metrics/metrics.service';

/**
 * Production-grade Redis service.
 *
 * Provides:
 * - Cache operations (get, set, del, getOrSet, invalidatePrefix)
 * - Distributed locking (acquireLock, releaseLock)
 * - Idempotency keys (setIdempotencyKey)
 * - Rate limiting (incrementRateLimit)
 * - Health check (ping, isConnected)
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly client: RedisClientType,
    private readonly metrics: MetricsService,
  ) {}

  // ═══════════════════════════════════════════════════════
  // CONNECTION & HEALTH
  // ═══════════════════════════════════════════════════════

  /**
   * Check if the Redis client is connected and responsive.
   */
  get isConnected(): boolean {
    return this.client?.isReady ?? false;
  }

  /**
   * Ping the Redis server. Returns latency in ms.
   */
  async ping(): Promise<number> {
    const start = Date.now();
    try {
      await this.client.ping();
      return Date.now() - start;
    } catch {
      return -1;
    }
  }

  /**
   * Get Redis server info for health checks.
   */
  async getHealthInfo(): Promise<{
    connected: boolean;
    latencyMs: number;
    dbSize: number;
    usedMemory: string;
  }> {
    try {
      const latencyMs = await this.ping();
      const dbSize = await this.client.dbSize();
      const info = await this.client.info('memory');
      const memMatch = info.match(/used_memory_human:(\S+)/);
      return {
        connected: this.isConnected,
        latencyMs,
        dbSize,
        usedMemory: memMatch?.[1] ?? 'unknown',
      };
    } catch {
      return {
        connected: false,
        latencyMs: -1,
        dbSize: 0,
        usedMemory: 'unknown',
      };
    }
  }

  // ═══════════════════════════════════════════════════════
  // CACHE OPERATIONS
  // ═══════════════════════════════════════════════════════

  /**
   * Get a cached value by key.
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected) return null;
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      this.metrics.redisCacheHitsTotal.inc();
      return JSON.parse(raw) as T;
    } catch (err: any) {
      this.logger.error(`Redis GET error [${key}]: ${err.message}`);
      return null;
    }
  }

  /**
   * Set a cache value with optional TTL in milliseconds.
   */
  async set<T>(
    key: string,
    value: T,
    ttlMs: number = CACHE_TTL.DEFAULT,
  ): Promise<void> {
    if (!this.isConnected) return;
    try {
      const serialized = JSON.stringify(value);
      await this.client.set(key, serialized, { PX: ttlMs });
    } catch (err: any) {
      this.logger.error(`Redis SET error [${key}]: ${err.message}`);
    }
  }

  /**
   * Delete a cache key.
   */
  async del(key: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.client.del(key);
    } catch (err: any) {
      this.logger.error(`Redis DEL error [${key}]: ${err.message}`);
    }
  }

  /**
   * Delete all keys matching a prefix using SCAN (production-safe).
   */
  async invalidatePrefix(prefix: string): Promise<number> {
    if (!this.isConnected) return 0;
    try {
      let deleted = 0;
      let cursor = '0';
      do {
        const result = await this.client.scan(cursor as any, {
          MATCH: `${prefix}*`,
          COUNT: 100,
        });
        cursor = String(result.cursor);
        if (result.keys.length > 0) {
          await this.client.del(result.keys);
          deleted += result.keys.length;
        }
      } while (cursor !== '0');
      return deleted;
    } catch (err: any) {
      this.logger.error(`Redis SCAN+DEL error [${prefix}*]: ${err.message}`);
      return 0;
    }
  }

  /**
   * Get or set pattern: returns cached value, or calls factory and caches the result.
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs: number = CACHE_TTL.DEFAULT,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    this.metrics.redisCacheMissesTotal.inc();
    const value = await factory();
    // Don't cache null/undefined results
    if (value !== null && value !== undefined) {
      await this.set(key, value, ttlMs);
    }
    return value;
  }

  // ═══════════════════════════════════════════════════════
  // DISTRIBUTED LOCKING
  // ═══════════════════════════════════════════════════════

  /**
   * Acquire a distributed lock using SET NX.
   * Returns a unique lock value (to safely release), or null if lock was not acquired.
   */
  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    if (!this.isConnected) return null;
    try {
      const lockValue = crypto.randomUUID();
      const result = await this.client.set(key, lockValue, {
        NX: true,
        PX: ttlMs,
      });
      if (result === 'OK') {
        this.metrics.redisLocksAcquiredTotal.inc();
        return lockValue;
      }
      return null;
    } catch (err: any) {
      this.logger.error(`Redis LOCK acquire error [${key}]: ${err.message}`);
      return null;
    }
  }

  /**
   * Release a distributed lock (atomic check-and-delete via Lua script).
   */
  async releaseLock(key: string, lockValue: string): Promise<boolean> {
    if (!this.isConnected) return false;
    try {
      // Lua script: only delete if the value matches (prevents releasing someone else's lock)
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      const result = await this.client.eval(script, {
        keys: [key],
        arguments: [lockValue],
      });
      return result === 1;
    } catch (err: any) {
      this.logger.error(`Redis LOCK release error [${key}]: ${err.message}`);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════
  // IDEMPOTENCY
  // ═══════════════════════════════════════════════════════

  /**
   * Set an idempotency key. Returns true if this is the FIRST call (proceed).
   * Returns false if a duplicate (reject).
   */
  async setIdempotencyKey(key: string, ttlMs: number): Promise<boolean> {
    if (!this.isConnected) return true; // Fail open if Redis is down
    try {
      const result = await this.client.set(key, '1', {
        NX: true,
        PX: ttlMs,
      });
      return result === 'OK';
    } catch (err: any) {
      this.logger.error(`Redis idempotency error [${key}]: ${err.message}`);
      return true; // Fail open
    }
  }

  /**
   * Remove an idempotency key (e.g., on failure to allow retry).
   */
  async clearIdempotencyKey(key: string): Promise<void> {
    await this.del(key);
  }

  // ═══════════════════════════════════════════════════════
  // RATE LIMITING (Sliding Window Counter)
  // ═══════════════════════════════════════════════════════

  /**
   * Increment a rate limit counter. Returns the current count after increment.
   * Sets TTL on first increment.
   */
  async incrementRateLimit(key: string, windowMs: number): Promise<number> {
    if (!this.isConnected) return 0; // Fail open
    try {
      const count = await this.client.incr(key);
      if (count === 1) {
        // First request in window — set expiry
        await this.client.pExpire(key, windowMs);
      }
      return count;
    } catch (err: any) {
      this.logger.error(`Redis rate limit error [${key}]: ${err.message}`);
      return 0; // Fail open
    }
  }

  /**
   * Get the current rate limit count for a key.
   */
  async getRateLimitCount(key: string): Promise<number> {
    if (!this.isConnected) return 0;
    try {
      const val = await this.client.get(key);
      return val ? parseInt(val, 10) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Check if a sliding window rate limit is exceeded.
   * Increments the count for the sliding window if allowed.
   * Returns true if rate limited, false if allowed.
   */
  async checkSlidingWindowLimit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    if (!this.isConnected) return false; // Fail open
    try {
      const now = Date.now();
      const minScore = now - windowMs;
      const member = `${now}:${crypto.randomBytes(4).toString('hex')}`;

      const results = await this.client
        .multi()
        .zAdd(key, { score: now, value: member })
        .zRemRangeByScore(key, '-inf', minScore)
        .zCard(key)
        .pExpire(key, windowMs)
        .exec();

      if (!results) {
        return false;
      }

      const currentCount = results[2] as unknown as number;
      const isExceeded = currentCount > limit;

      if (isExceeded) {
        // Remove the member we just added to avoid penalizing subsequent requests longer than necessary
        await this.client.zRem(key, member);
        return true;
      }

      return false;
    } catch (err: any) {
      this.logger.error(
        `Redis sliding window rate limit error [${key}]: ${err.message}`,
      );
      return false; // Fail open
    }
  }

  /**
   * Set a cooldown key with TTL.
   * Returns true if the cooldown was successfully set (allowed to proceed).
   * Returns false if the cooldown key was already present (blocked).
   */
  async setCooldown(key: string, cooldownMs: number): Promise<boolean> {
    if (!this.isConnected) return true; // Fail open
    try {
      const result = await this.client.set(key, '1', {
        NX: true,
        PX: cooldownMs,
      });
      return result === 'OK';
    } catch (err: any) {
      this.logger.error(`Redis setCooldown error [${key}]: ${err.message}`);
      return true; // Fail open
    }
  }

  // ═══════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      this.logger.log('Closing Redis connection...');
      await this.client.quit();
      this.logger.log('Redis connection closed');
    }
  }
}
