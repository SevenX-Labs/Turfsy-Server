import { Injectable, Logger } from '@nestjs/common';
import { LRUCache } from 'lru-cache';

/**
 * In-memory LRU cache service for frequently accessed data.
 * Reduces DB load for hot paths like user profiles, turf details, etc.
 *
 * Cache keys follow convention: `${entity}:${id}`
 * TTL is per-entry configurable, defaults to 5 minutes.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  private readonly cache = new LRUCache<string, any>({
    max: 2000,                // Max 2000 entries
    ttl: 1000 * 60 * 5,       // Default 5-minute TTL
    allowStale: false,
    updateAgeOnGet: true,     // Reset TTL on read (sliding window)
  });

  /**
   * Get a cached value by key.
   * Returns undefined if not found or expired.
   */
  get<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  /**
   * Set a cached value with optional custom TTL (in ms).
   */
  set<T>(key: string, value: T, ttlMs?: number): void {
    if (ttlMs) {
      this.cache.set(key, value, { ttl: ttlMs });
    } else {
      this.cache.set(key, value);
    }
  }

  /**
   * Invalidate a specific cache key.
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all keys matching a prefix.
   * Example: invalidatePrefix('user-profile:') clears all user profile caches.
   */
  invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
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
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Get cache statistics for monitoring.
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
    };
  }
}
