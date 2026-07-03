import { Controller, Get, Res } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as express from 'express';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { MetricsService } from './common/metrics/metrics.service';
import { RedisService } from './common/redis/redis.service';
import * as os from 'os';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly redisService: RedisService,
    @InjectQueue('booking-expiry') private readonly bookingExpiryQueue: Queue,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Hello World root endpoint' })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('turfzy/health')
  @ApiOperation({ summary: 'Get system and database health diagnostics' })
  @ApiResponse({ status: 200, description: 'All services are healthy' })
  @ApiResponse({
    status: 503,
    description: 'One or more critical services are unhealthy',
  })
  async checkHealth(@Res() res: express.Response) {
    const startTime = performance.now();

    // 1. Check PostgreSQL connection (critical)
    let dbStatus: 'healthy' | 'unhealthy' = 'healthy';
    let dbError: string | undefined;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      dbStatus = 'unhealthy';
      dbError = err.message || String(err);
    }

    // 2. Check Redis connection (critical)
    let redisStatus: 'healthy' | 'unhealthy' = 'healthy';
    let redisMessage = 'Connected successfully';
    try {
      const redisHealth = await this.redisService.getHealthInfo();
      if (!redisHealth.connected) {
        redisStatus = 'unhealthy';
        redisMessage = 'Redis connection is down';
      } else {
        redisMessage = `Connected (Latency: ${redisHealth.latencyMs}ms, Size: ${redisHealth.dbSize})`;
      }
    } catch (err: any) {
      redisStatus = 'unhealthy';
      redisMessage = err.message || String(err);
    }

    // 2.5 Check BullMQ status
    let bullmqStatus: 'healthy' | 'unhealthy' = 'healthy';
    let bullmqMessage = 'BullMQ is active and healthy';
    let waitingJobs = 0;
    let activeJobs = 0;
    let failedJobs = 0;
    try {
      const counts = await this.bookingExpiryQueue.getJobCounts(
        'waiting',
        'active',
        'failed',
      );
      waitingJobs = counts.waiting || 0;
      activeJobs = counts.active || 0;
      failedJobs = counts.failed || 0;
    } catch (err: any) {
      bullmqStatus = 'unhealthy';
      bullmqMessage = err.message || String(err);
    }

    // 3. Overall status verification
    const isCriticalHealthy =
      dbStatus === 'healthy' && redisStatus === 'healthy';
    const overallStatus = isCriticalHealthy ? 'healthy' : 'unhealthy';

    // 4. Calculate process uptime
    const uptimeSeconds = process.uptime();
    const d = Math.floor(uptimeSeconds / (3600 * 24));
    const h = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
    const m = Math.floor((uptimeSeconds % 3600) / 60);
    const s = Math.floor(uptimeSeconds % 60);
    const uptimeFormatted = `${d}d ${h}h ${m}m ${s}s`;

    // 5. Gather CPU and Memory usage
    const memoryUsageRaw = process.memoryUsage();
    const memory = {
      rss: `${Math.round((memoryUsageRaw.rss / 1024 / 1024) * 100) / 100} MB`,
      heapTotal: `${Math.round((memoryUsageRaw.heapTotal / 1024 / 1024) * 100) / 100} MB`,
      heapUsed: `${Math.round((memoryUsageRaw.heapUsed / 1024 / 1024) * 100) / 100} MB`,
      external: `${Math.round((memoryUsageRaw.external / 1024 / 1024) * 100) / 100} MB`,
    };

    const cpu = {
      loadAverage: os.loadavg(),
      cores: os.cpus().length,
    };

    // 6. Gather application metrics
    let totalRequestsHandled = 0;
    try {
      const metric = await this.metrics.httpRequestTotal.get();
      if (metric && metric.values) {
        totalRequestsHandled = metric.values.reduce(
          (sum, v) => sum + v.value,
          0,
        );
      }
    } catch {
      // Metric reading fallback
    }

    const poolStats = this.prisma.getPoolStats();

    // 7. Calculate response time
    const responseTimeMs =
      Math.round((performance.now() - startTime) * 100) / 100;

    const healthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      service: 'Turfzy API',
      version: '0.0.1',
      environment: process.env.NODE_ENV || 'development',
      uptime: {
        seconds: Math.round(uptimeSeconds),
        formatted: uptimeFormatted,
      },
      system: {
        api: {
          status: 'healthy',
        },
        database: {
          status: dbStatus,
          type: 'PostgreSQL',
          error: dbError,
        },
        redis: {
          status: redisStatus,
          message: redisMessage,
        },
        bullmq: {
          status: bullmqStatus,
          message: bullmqMessage,
        },
        memory,
        cpu,
        node: process.version,
      },
      metrics: {
        totalRequestsHandled,
        activeDatabaseConnections: {
          total: poolStats.total,
          idle: poolStats.idle,
          waiting: poolStats.waiting,
        },
        queueStatistics: {
          waitingJobs,
          activeJobs,
          failedJobs,
        },
      },
      deployment: {
        buildVersion: '0.0.1',
        commitSha:
          process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'unknown',
        timestamp: new Date().toISOString(), // Fallback deployment timestamp
      },
      responseTimeMs,
    };

    // 8. Return response with correct status code (200 or 503)
    const httpStatusCode = isCriticalHealthy ? 200 : 503;
    return res.status(httpStatusCode).json(healthResponse);
  }
}
