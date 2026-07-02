import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from '../metrics/metrics.service';

/**
 * Global interceptor that records HTTP request duration,
 * total request count, and status code distribution.
 *
 * Normalises route paths by replacing dynamic segments
 * (UUIDs, numeric IDs) with `:id` to keep cardinality low.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;
    const startTime = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          this.recordMetrics(method, req.route?.path || req.url, res.statusCode, startTime);
        },
        error: (err) => {
          const statusCode = err?.status || err?.getStatus?.() || 500;
          this.recordMetrics(method, req.route?.path || req.url, statusCode, startTime);
        },
      }),
    );
  }

  private recordMetrics(
    method: string,
    rawRoute: string,
    statusCode: number,
    startTime: bigint,
  ): void {
    const route = this.normaliseRoute(rawRoute);
    const durationSeconds = Number(process.hrtime.bigint() - startTime) / 1e9;
    const statusCodeStr = String(statusCode);

    this.metrics.httpRequestTotal.inc({
      method,
      route,
      status_code: statusCodeStr,
    });

    this.metrics.httpRequestDuration.observe(
      { method, route, status_code: statusCodeStr },
      durationSeconds,
    );

    // Bucket by status class: 2xx, 3xx, 4xx, 5xx
    const statusClass = `${Math.floor(statusCode / 100)}xx`;
    this.metrics.httpStatusCodeTotal.inc({ status_class: statusClass });
  }

  /**
   * Replace dynamic path segments (UUIDs, long hex IDs, numeric IDs)
   * with `:id` to prevent metric cardinality explosion.
   */
  private normaliseRoute(route: string): string {
    return route
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        ':id',
      )
      .replace(/\/[0-9a-f]{20,}/gi, '/:id')
      .replace(/\/\d+/g, '/:id');
  }
}
