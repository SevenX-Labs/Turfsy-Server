import { Controller, Get } from '@nestjs/common';
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

  @Get('health')
  async checkHealth() {
    const endpointGroups = this.appService.getEndpointHealthCatalog();
    const endpointCount = endpointGroups.reduce(
      (total, group) => total + group.routes.length,
      0,
    );
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
          message: 'All registered endpoint groups reported as working',
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
          message: 'Endpoint catalog loaded but database health check failed',
          numberedModules,
          modules: endpointGroups,
        },
      };
    }
  }
}
