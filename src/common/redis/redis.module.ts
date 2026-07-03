import { Global, Module } from '@nestjs/common';
import { RedisProvider } from './redis.provider';
import { RedisService } from './redis.service';

/**
 * Global Redis module.
 *
 * - Registers a single Redis client connection shared across the application
 * - Provides RedisService globally for cache, locking, idempotency, and rate limiting
 * - Graceful shutdown handled by RedisService.onModuleDestroy
 */
@Global()
@Module({
  providers: [RedisProvider, RedisService],
  exports: [RedisService],
})
export class RedisModule {}
