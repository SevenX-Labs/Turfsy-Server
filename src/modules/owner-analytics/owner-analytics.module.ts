import { Module } from '@nestjs/common';
import { OwnerAnalyticsService } from './owner-analytics.service';
import { OwnerAnalyticsController } from './owner-analytics.controller';

@Module({
  controllers: [OwnerAnalyticsController],
  providers: [OwnerAnalyticsService],
})
export class OwnerAnalyticsModule {}
