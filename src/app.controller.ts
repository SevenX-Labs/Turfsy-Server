import { Controller, Get, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get(['sahil/hode/api/health'])
  async checkHealth(@Req() req: any) {
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

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        message: 'Database connected and all listed endpoints are active',
        timestamp: new Date().toISOString(),
        database: {
          status: 'connected',
          message: 'Database connected, Prisma connected successfully',
        },
        api: {
          status: 'working',
          groups: endpointGroups.length,
          endpoints: endpointCount,
          catalogEndpoints: catalogEndpointCount,
          message:
            'Live endpoint scan completed and grouped endpoint catalog loaded',
          allEndpoints,
          numberedModules,
          modules: endpointGroups,
        },
      };
    } catch {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        message: 'Database connection failed',
        database: {
          status: 'disconnected',
          message: 'Database connection failed',
        },
        api: {
          status: 'degraded',
          groups: endpointGroups.length,
          endpoints: endpointCount,
          catalogEndpoints: catalogEndpointCount,
          message:
            'Live endpoint scan completed but database health check failed',
          allEndpoints,
          numberedModules,
          modules: endpointGroups,
        },
      };
    }
  }
}
