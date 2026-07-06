import { Controller, Get, Patch, Param, Query, Body, UseGuards, Req, Res } from '@nestjs/common';
import { AdminOwnersService } from './admin-owners.service';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';
import { SuspendOwnerDto } from './dto/suspend-owner.dto';
import { CurrentAdmin } from '../auth/decorators/admin.decorator';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin Owners')
@Controller('api/v1/admin/owners')
@UseGuards(JwtAdminGuard)
@ApiBearerAuth()
export class AdminOwnersController {
  constructor(private readonly ownersService: AdminOwnersService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter owners' })
  async getOwners(
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'suspended',
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.ownersService.listOwners({ search, status, page, limit });
  }

  @Get('export/csv')
  @ApiOperation({ summary: 'Export owners to CSV file' })
  async exportCsv(@Res() res: Response) {
    const csv = await this.ownersService.exportOwnersCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=owners.csv');
    return res.status(200).send(csv);
  }

  @Get('export/pdf')
  @ApiOperation({ summary: 'Export owners list to PDF' })
  async exportPdf(@Res() res: Response) {
    const buffer = await this.ownersService.exportOwnersPdf();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=owners_report.pdf');
    return res.status(200).send(buffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get owner details and summary statistics' })
  async getOwnerDetails(@Param('id') id: string) {
    return this.ownersService.getOwnerDetails(id);
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspend owner account' })
  async suspendOwner(
    @Param('id') id: string,
    @Body() dto: SuspendOwnerDto,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.ownersService.suspendOwner(id, dto.reason, admin.adminId, ip);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate suspended owner account' })
  async activateOwner(
    @Param('id') id: string,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.ownersService.activateOwner(id, admin.adminId, ip);
  }

  @Get(':id/bank-details')
  @ApiOperation({ summary: 'Get owner bank details' })
  async getBankDetails(@Param('id') id: string) {
    return this.ownersService.getBankDetails(id);
  }

  @Get(':id/settlements')
  @ApiOperation({ summary: 'Get settlement history for owner' })
  async getSettlementHistory(@Param('id') id: string) {
    return this.ownersService.getSettlementHistory(id);
  }
}
