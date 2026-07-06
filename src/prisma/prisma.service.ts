import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ModuleRef } from '@nestjs/core';
import { MetricsService } from '../common/metrics/metrics.service';
import 'dotenv/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;
  private metrics?: MetricsService;

  constructor(private readonly moduleRef: ModuleRef) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // ── Optimized Connection Pooling ──
      max: 20, // Increased from 15 for higher concurrency
      min: 5, // Keep minimum warm connections
      idleTimeoutMillis: 30000, // Release idle connections after 30s
      connectionTimeoutMillis: 30000, // Increased to 30s to prevent Render startup timeouts
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      statement_timeout: 30000, // Kill queries running > 30s
    });
    const adapter = new PrismaPg(pool as any);
    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' } as const,
        { emit: 'stdout', level: 'error' } as const,
        ...(process.env.NODE_ENV !== 'production'
          ? [
              { emit: 'stdout', level: 'info' } as const,
              { emit: 'stdout', level: 'warn' } as const,
            ]
          : []),
      ],
    });
    this.pool = pool;
  }

  async onModuleInit() {
    // Resolve MetricsService lazily to avoid circular dependency
    try {
      this.metrics = this.moduleRef.get(MetricsService, { strict: false });
    } catch {
      // MetricsService not available yet — skip instrumentation
    }

    // Subscribe to query events for Prometheus metrics
    (this as any).$on('query', (e: any) => {
      if (this.metrics) {
        let model = 'unknown';
        let action = 'query';
        const queryText = e.query || '';

        if (queryText.includes('SELECT')) {
          action = 'select';
        } else if (queryText.includes('INSERT')) {
          action = 'insert';
        } else if (queryText.includes('UPDATE')) {
          action = 'update';
        } else if (queryText.includes('DELETE')) {
          action = 'delete';
        }

        const tableMatch =
          queryText.match(/FROM\s+"public"\."(\w+)"/i) ||
          queryText.match(/INTO\s+"public"\."(\w+)"/i) ||
          queryText.match(/UPDATE\s+"public"\."(\w+)"/i);
        if (tableMatch && tableMatch[1]) {
          model = tableMatch[1];
        }

        this.metrics.prismaQueryTotal.inc({ model, action });
        this.metrics.prismaQueryDuration.observe(
          { model, action },
          e.duration / 1000,
        );
      }

      if (process.env.NODE_ENV !== 'production') {
        this.logger.debug(
          `Query: ${e.query} | Params: ${e.params} | Duration: ${e.duration}ms`,
        );
      }
    });

    await this.$connect();
    this.logger.log('Database connected successfully');
  }

  /**
   * Wrap any Prisma call with query-level metrics.
   * Usage: instead of `this.prisma.booking.findMany(...)`,
   * metrics are collected via the query event listener automatically.
   */
  trackQuery(model: string, action: string, durationMs: number): void {
    if (this.metrics) {
      this.metrics.prismaQueryTotal.inc({ model, action });
      this.metrics.prismaQueryDuration.observe(
        { model, action },
        durationMs / 1000,
      );
    }
  }

  /**
   * Expose Postgres connection pool statistics for health checks.
   */
  getPoolStats() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('Database connections closed');
  }
}
