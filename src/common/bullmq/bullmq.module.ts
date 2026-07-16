import {
  Module,
  Global,
  forwardRef,
  OnApplicationShutdown,
  Logger,
} from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { BookingWorker } from './workers/booking.worker';
import { NotificationWorker } from './workers/notification.worker';
import { PaymentWorker } from './workers/payment.worker';
import { AnalyticsWorker } from './workers/analytics.worker';
import { CleanupWorker } from './workers/cleanup.worker';
import { EmailWorker } from './workers/email.worker';
import { PaymentRetryWorker } from './workers/payment-retry.worker';
import { BookingExpiryWorker } from './workers/booking-expiry.worker';

import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { BookingModule } from '../../modules/booking/booking.module';

const logger = new Logger('BullMqRedis');

/**
 * Module-level reference to the shared ioredis connection used by BullMQ.
 *
 * By passing a single ioredis *instance* (instead of connection options) to
 * BullModule.forRootAsync, all 8 registered Queues reuse this one socket
 * (sharedConnection = true) while each Worker only creates ONE additional
 * blocking connection via `connection.duplicate()`.
 *
 * Connection count:
 *   Before: 8 queues × 1 + 8 workers × 2 = 24 ioredis connections
 *   After:  1 shared + 8 worker blocking   =  9 ioredis connections
 */
let sharedConnection: Redis | null = null;

@Global()
@Module({
  imports: [
    NotificationsModule,
    EmailModule,
    PrismaModule,
    forwardRef(() => BookingModule),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');

        sharedConnection = new Redis(redisUrl!, {
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

        sharedConnection.on('connect', () => {
          logger.log('BullMQ shared Redis connection established');
        });

        sharedConnection.on('error', (err: Error) => {
          logger.error(`BullMQ shared Redis error: ${err.message}`);
        });

        sharedConnection.on('close', () => {
          logger.warn('BullMQ shared Redis connection closed');
        });

        return { connection: sharedConnection };
      },
    }),
    BullModule.registerQueue(
      { name: 'booking' },
      { name: 'payment' },
      { name: 'notification' },
      { name: 'analytics' },
      { name: 'cleanup' },
      {
        name: 'email',
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      },
      {
        name: 'payment-retry',
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 60000, // 1 minute
          },
        },
      },
      {
        name: 'booking-expiry',
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      },
    ),
  ],
  providers: [
    BookingWorker,
    NotificationWorker,
    PaymentWorker,
    AnalyticsWorker,
    CleanupWorker,
    EmailWorker,
    PaymentRetryWorker,
    BookingExpiryWorker,
  ],
  exports: [BullModule],
})
export class BullMqModule implements OnApplicationShutdown {
  private readonly logger = new Logger(BullMqModule.name);

  /**
   * Called by NestJS when the application shuts down (SIGTERM, SIGINT, hot-reload).
   * Closes the shared ioredis connection that BullMQ queues and workers rely on.
   *
   * Workers' blocking connections are closed automatically by @nestjs/bullmq
   * when their host providers are destroyed. This hook handles the remaining
   * shared connection that BullMQ deliberately does NOT close (sharedConnection flag).
   */
  async onApplicationShutdown(signal?: string) {
    this.logger.log(
      `Shutting down BullMQ connections (signal: ${signal || 'none'})...`,
    );

    if (sharedConnection) {
      try {
        // quit() sends the QUIT command and waits for the server to acknowledge
        await sharedConnection.quit();
        this.logger.log('BullMQ shared Redis connection closed gracefully');
      } catch (err: any) {
        this.logger.error(
          `Error during BullMQ Redis quit: ${err.message}. Force-disconnecting.`,
        );
        // disconnect() forcefully drops the TCP socket without waiting
        sharedConnection.disconnect();
      }
      sharedConnection = null;
    }
  }
}
