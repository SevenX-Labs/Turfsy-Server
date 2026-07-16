import {
  Module,
  Global,
  forwardRef,
  OnApplicationShutdown,
  Inject,
  Logger,
} from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
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

import { BULLMQ_CONNECTION } from './bullmq-connection.provider';
import { BullMqConnectionModule } from './bullmq-connection.module';

/**
 * Global BullMQ module.
 *
 * Connection architecture (DI-managed):
 * ─────────────────────────────────────
 * 1. BullMqConnectionModule registers a single ioredis instance as BULLMQ_CONNECTION global provider.
 * 2. BullModule.forRootAsync receives it via inject: [BULLMQ_CONNECTION].
 * 3. All 8 queues reuse the shared socket (sharedConnection = true in BullMQ internals)
 * 4. Each of the 8 workers duplicates it once for blocking BRPOPLPUSH
 * 5. OnApplicationShutdown closes the shared connection (workers' blocking
 *    connections are closed by @nestjs/bullmq WorkerHost.onModuleDestroy)
 *
 * Total connections: 1 shared + 8 worker blocking = 9 ioredis connections
 */
@Global()
@Module({
  imports: [
    NotificationsModule,
    EmailModule,
    PrismaModule,
    forwardRef(() => BookingModule),
    BullMqConnectionModule, // Imports the global connection singleton
    BullModule.forRootAsync({
      inject: [BULLMQ_CONNECTION],
      useFactory: (connection: Redis) => ({ connection }),
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

  constructor(
    @Inject(BULLMQ_CONNECTION) private readonly connection: Redis,
  ) {}

  /**
   * Called by NestJS on SIGTERM, SIGINT, hot-reload, or app.close().
   *
   * Closes the shared ioredis connection. Workers' blocking connections
   * are already closed by @nestjs/bullmq's WorkerHost.onModuleDestroy
   * which fires before OnApplicationShutdown.
   */
  async onApplicationShutdown(signal?: string) {
    this.logger.log(
      `Shutting down BullMQ connections (signal: ${signal || 'none'})...`,
    );

    try {
      await this.connection.quit();
      this.logger.log('BullMQ shared Redis connection closed gracefully');
    } catch (err: any) {
      this.logger.error(
        `Error during BullMQ Redis quit: ${err.message}. Force-disconnecting.`,
      );
      this.connection.disconnect();
    }
  }
}
