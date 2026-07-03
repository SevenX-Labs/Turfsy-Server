import { Module, Global, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

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
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL'),
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        },
      }),
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
export class BullMqModule {}
