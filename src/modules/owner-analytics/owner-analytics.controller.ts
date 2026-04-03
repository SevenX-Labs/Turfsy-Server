import { Controller } from '@nestjs/common';
import { OwnerAnalyticsService } from './owner-analytics.service';

@Controller('owner-analytics')
export class OwnerAnalyticsController {
  constructor(private readonly ownerAnalyticsService: OwnerAnalyticsService) {}
}
