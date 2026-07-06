import { Controller, Get, Patch, Param, Query, Body, UseGuards, Req } from '@nestjs/common';
import { AdminTurfsService } from './admin-turfs.service';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';
import { SuspendTurfDto } from './dto/suspend-turf.dto';
import { CurrentAdmin } from '../auth/decorators/admin.decorator';
import type { Request } from 'express';
import { TurfStatus } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin Turfs')
@Controller('api/v1/admin/turfs')
@UseGuards(JwtAdminGuard)
@ApiBearerAuth()
export class AdminTurfsController {
  constructor(private readonly turfsService: AdminTurfsService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter all turfs' })
  async getTurfs(
    @Query('search') search?: string,
    @Query('status') status?: TurfStatus,
    @Query('city') city?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.turfsService.listTurfs({ search, status, city, page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get complete turf details' })
  async getTurfDetails(@Param('id') id: string) {
    return this.turfsService.getTurfDetails(id);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate/approve a turf' })
  async activateTurf(
    @Param('id') id: string,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.turfsService.updateTurfStatus(id, 'ACTIVE', admin.adminId, ip);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a turf' })
  async deactivateTurf(
    @Param('id') id: string,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.turfsService.updateTurfStatus(id, 'INACTIVE', admin.adminId, ip);
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspend a turf with an optional reason' })
  async suspendTurf(
    @Param('id') id: string,
    @Body() dto: SuspendTurfDto,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.turfsService.updateTurfStatus(id, 'SUSPENDED', admin.adminId, ip, dto.reason);
  }

  @Patch(':id/feature')
  @ApiOperation({ summary: 'Feature a turf (pin on frontpage)' })
  async featureTurf(
    @Param('id') id: string,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.turfsService.featureTurf(id, admin.adminId, ip);
  }

  @Patch(':id/unfeature')
  @ApiOperation({ summary: 'Remove featured status from turf' })
  async unfeatureTurf(
    @Param('id') id: string,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.turfsService.unfeatureTurf(id, admin.adminId, ip);
  }
}
