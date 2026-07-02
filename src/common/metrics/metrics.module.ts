import { Global, Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';

/**
 * Global metrics module.
 *
 * - Registers PrometheusModule which exposes GET /metrics
 * - Provides MetricsService globally for counter/histogram injection
 * - Default Node.js and process metrics are enabled by default
 */
@Global()
@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
      },
      // GET /metrics endpoint is auto-registered
    }),
  ],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
