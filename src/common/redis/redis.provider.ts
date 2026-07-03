import { Provider, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { REDIS_CLIENT } from './redis.constants';
import { MetricsService } from '../metrics/metrics.service';

const logger = new Logger('RedisProvider');

/**
 * Factory provider that creates and connects a Redis client.
 *
 * - Uses REDIS_URL from environment
 * - Automatic reconnect (built into redis v5)
 * - Pino-compatible logging for connect / disconnect / error
 * - Prometheus metrics for connection status and errors
 */
export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: async (
    config: ConfigService,
    metrics: MetricsService,
  ): Promise<RedisClientType> => {
    const redisUrl = config.get<string>('REDIS_URL');

    if (!redisUrl) {
      logger.warn('REDIS_URL is not configured — Redis features will be unavailable');
      return null as any;
    }

    const client = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries: number) => {
          if (retries > 20) {
            logger.error('Redis max reconnection attempts reached');
            return new Error('Redis max reconnection attempts reached');
          }
          const delay = Math.min(retries * 500, 5000);
          logger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
          return delay;
        },
      },
    }) as RedisClientType;

    client.on('connect', () => {
      logger.log('Redis client connecting...');
    });

    client.on('ready', () => {
      logger.log('Redis client connected and ready');
      metrics.redisConnected.set(1);
    });

    client.on('error', (err: Error) => {
      logger.error(`Redis client error: ${err.message}`);
      metrics.redisErrorsTotal.inc();
      metrics.redisConnected.set(0);
    });

    client.on('reconnecting', () => {
      logger.warn('Redis client reconnecting...');
      metrics.redisConnected.set(0);
    });

    client.on('end', () => {
      logger.log('Redis client disconnected');
      metrics.redisConnected.set(0);
    });

    try {
      await client.connect();
    } catch (err: any) {
      logger.error(`Redis initial connection failed: ${err.message}`);
      metrics.redisConnected.set(0);
      // Don't throw — let the app start without Redis and retry via reconnectStrategy
    }

    return client;
  },
  inject: [ConfigService, MetricsService],
};
