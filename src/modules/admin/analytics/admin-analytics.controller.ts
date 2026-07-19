import { Controller, Get, UseGuards, Res } from '@nestjs/common';
import { AdminAnalyticsService } from './admin-analytics.service';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin Analytics')
@Controller('api/v1/admin/analytics')
@UseGuards(JwtAdminGuard)
@ApiBearerAuth()
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AdminAnalyticsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get detailed booking, revenue, and platform analytics',
  })
  async getAnalytics() {
    return this.analyticsService.getPlatformAnalytics();
  }

  @Get('export/csv')
  @ApiOperation({ summary: 'Export analytics summary to CSV' })
  async exportCsv(@Res() res: Response) {
    const csv = await this.analyticsService.exportAnalyticsCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=analytics.csv');
    return res.status(200).send(csv);
  }

  @Get('export/pdf')
  @ApiOperation({ summary: 'Export analytics summary report to PDF' })
  async exportPdf(@Res() res: Response) {
    const buffer = await this.analyticsService.exportAnalyticsPdf();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=analytics_report.pdf',
    );
    return res.status(200).send(buffer);
  }
}
