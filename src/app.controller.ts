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

  @Get('ping')
  async pingDatabase() {
    try {
      // Execute a simple raw query to prove connection
      const result = await this.prisma.$queryRaw`SELECT 1 as connected`;
      return {
        message: 'Successfully connected to database!',
        result,
      };
    } catch (error) {
      return {
        message: 'Failed to connect to database.',
        error: error.message,
      };
    }
  }
}

