import { Global, Module } from '@nestjs/common';
import {
  BULLMQ_CONNECTION,
  BullMqConnectionProvider,
} from './bullmq-connection.provider';

/**
 * Tiny module that owns the shared BullMQ ioredis connection.
 *
 * Imported by both BullModule.forRootAsync (to supply the connection)
 * and BullMqModule (to @Inject it for lifecycle shutdown).
 * NestJS DI resolves the BULLMQ_CONNECTION token exactly once because
 * this module is @Global().
 */
@Global()
@Module({
  providers: [BullMqConnectionProvider],
  exports: [BULLMQ_CONNECTION],
})
export class BullMqConnectionModule {}
