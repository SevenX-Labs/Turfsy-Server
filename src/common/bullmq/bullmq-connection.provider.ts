import { Provider, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
// Hot-reload edit 3

/**
 * DI injection token for the shared BullMQ ioredis connection.
 *
 * All 8 BullMQ queues reuse this single socket (sharedConnection = true).
 * Each of the 8 workers duplicates it once for their blocking BRPOPLPUSH socket.
 *
 * Total BullMQ connections: 1 (shared) + 8 (worker blocking) = 9
 */
export const BULLMQ_CONNECTION = Symbol('BULLMQ_CONNECTION');

const logger = new Logger('BullMqRedis');

/**
 * Factory provider that creates the shared ioredis instance for BullMQ.
 *
 * Lifecycle: created once by NestJS DI, destroyed via BullMqModule.onApplicationShutdown
 * which injects BULLMQ_CONNECTION and calls quit()/disconnect().
 */
export const BullMqConnectionProvider: Provider<Redis> = {
  provide: BULLMQ_CONNECTION,
  useFactory: (configService: ConfigService): Redis => {
    const redisUrl = configService.get<string>('REDIS_URL');

    const connection = new Redis(redisUrl!, {
      maxRetriesPerRequest: null, // Required by BullMQ for blocking commands
      enableReadyCheck: false, // Avoids extra READY check round-trip
      retryStrategy: (times: number) => {
        if (times > 20) {
          logger.error('BullMQ Redis max reconnection attempts reached');
          return null; // Stop reconnecting
        }
        const delay = Math.min(times * 500, 5000);
        logger.warn(
          `BullMQ Redis reconnecting in ${delay}ms (attempt ${times})`,
        );
        return delay;
      },
    });

    connection.on('connect', () => {
      logger.log('BullMQ shared Redis connection established');
    });

    connection.on('error', (err: Error) => {
      logger.error(`BullMQ shared Redis error: ${err.message}`);
    });

    connection.on('close', () => {
      logger.warn('BullMQ shared Redis connection closed');
    });

    return connection;
  },
  inject: [ConfigService],
};
