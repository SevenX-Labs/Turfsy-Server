import { Module } from '@nestjs/common';
import { OwnerAnalyticsService } from './owner-analytics.service';
import { OwnerAnalyticsController } from './owner-analytics.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OwnerAnalyticsController],
  providers: [OwnerAnalyticsService],
})
export class OwnerAnalyticsModule {}
