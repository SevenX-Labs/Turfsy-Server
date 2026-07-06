import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuditLogsService } from './admin-audit-logs.service';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';
import { AdminActionType } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin Audit Logs')
@Controller('api/v1/admin/audit-logs')
@UseGuards(JwtAdminGuard)
@ApiBearerAuth()
export class AdminAuditLogsController {
  constructor(private readonly auditLogsService: AdminAuditLogsService) {}

  @Get()
  @ApiOperation({ summary: 'List, filter, and search system audit logs' })
  async getLogs(
    @Query('search') search?: string,
    @Query('action') action?: AdminActionType,
    @Query('adminId') adminId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.auditLogsService.listAuditLogs({
      search,
      action,
      adminId,
      dateFrom,
      dateTo,
      page,
      limit,
    });
  }
}
