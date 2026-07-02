import { Controller, Get, Res, Req } from '@nestjs/common';
import * as express from 'express';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { MetricsService } from './common/metrics/metrics.service';
import * as os from 'os';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('turfzy/health')
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
    if (process.env.REDIS_URL) {
      const { createClient } = require('redis');
      const client = createClient({
        url: process.env.REDIS_URL,
        socket: {
          connectTimeout: 2000,
        },
      });
      try {
        await client.connect();
        await client.ping();
        await client.disconnect();
      } catch (err: any) {
        redisStatus = 'unhealthy';
        redisMessage = err.message || String(err);
      }
    } else {
      redisStatus = 'unhealthy';
      redisMessage = 'REDIS_URL is not configured';
    }

    // 3. Overall status verification
    const isCriticalHealthy = dbStatus === 'healthy' && redisStatus === 'healthy';
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
        totalRequestsHandled = metric.values.reduce((sum, v) => sum + v.value, 0);
      }
    } catch {
      // Metric reading fallback
    }

    const poolStats = this.prisma.getPoolStats();

    // 7. Calculate response time
    const responseTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

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
          status: 'inactive',
          message: 'BullMQ is not active in this environment',
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
          waitingJobs: 0,
          activeJobs: 0,
          failedJobs: 0,
        },
      },
      deployment: {
        buildVersion: '0.0.1',
        commitSha: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'unknown',
        timestamp: new Date().toISOString(), // Fallback deployment timestamp
      },
      responseTimeMs,
    };

    // 8. Return response with correct status code (200 or 503)
    const httpStatusCode = isCriticalHealthy ? 200 : 503;
    return res.status(httpStatusCode).json(healthResponse);
  }

  @Get('turfzy/api')
  async listAllApi(@Req() req: any) {
    const endpointGroups = this.appService.getEndpointHealthCatalog();
    const catalogEndpointCount = endpointGroups.reduce(
      (total, group) => total + group.routes.length,
      0,
    );
    const allEndpoints = this.appService.getLiveEndpoints(req.app);
    const endpointCount = allEndpoints.length;
    const numberedModules = endpointGroups.map((group, index) => ({
      index: index + 1,
      label: `${index + 1}. ${group.module} - ${group.routes.length} endpoints`,
      module: group.module,
      endpoints: group.routes.length,
      basePath: group.basePath,
      status: group.status,
    }));

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      api: {
        groups: endpointGroups.length,
        endpoints: endpointCount,
        catalogEndpoints: catalogEndpointCount,
        message: 'Live endpoint scan completed and grouped endpoint catalog loaded',
        allEndpoints,
        numberedModules,
        modules: endpointGroups,
      },
    };
  }
}


