import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OwnerCrmController } from './owner-crm.controller';
import { OwnerCrmService } from './owner-crm.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../../common/notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    NotificationsModule,
    BullModule.registerQueue({
      name: 'notification',
    }),
  ],
  controllers: [OwnerCrmController],
  providers: [OwnerCrmService],
  exports: [OwnerCrmService],
})
export class OwnerCrmModule {}

