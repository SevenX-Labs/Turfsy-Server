import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { NotificationsController } from './notifications.controller';
import { AuthModule } from '../../modules/auth/auth.module';
import { FirebaseAdminModule } from '../firebase/firebase-admin.module';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule, FirebaseAdminModule],
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
