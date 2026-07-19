import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { AdminSettlementsService } from './admin-settlements.service';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { MarkPaidDto } from './dto/mark-paid.dto';
import { CurrentAdmin } from '../auth/decorators/admin.decorator';
import type { Request, Response } from 'express';
import { SettlementStatus } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin Settlements')
@Controller('api/v1/admin/settlements')
@UseGuards(JwtAdminGuard)
@ApiBearerAuth()
export class AdminSettlementsController {
  constructor(private readonly settlementsService: AdminSettlementsService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter settlements' })
  async getSettlements(
    @Query('status') status?: SettlementStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.settlementsService.listSettlements({ status, page, limit });
  }

  @Get('export/csv')
  @ApiOperation({ summary: 'Export settlements to CSV' })
  async exportCsv(@Res() res: Response) {
    const csv = await this.settlementsService.exportSettlementsCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=settlements.csv',
    );
    return res.status(200).send(csv);
  }

  @Get('export/pdf')
  @ApiOperation({ summary: 'Export settlements to PDF' })
  async exportPdf(@Res() res: Response) {
    const buffer = await this.settlementsService.exportSettlementsPdf();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=settlements_report.pdf',
    );
    return res.status(200).send(buffer);
  }

  @Get('owner/:ownerId')
  @ApiOperation({ summary: 'Get settlement history for specific owner' })
  async getOwnerSettlements(@Param('ownerId') ownerId: string) {
    return this.settlementsService.getOwnerSettlements(ownerId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get detailed settlement record by ID' })
  async getSettlementDetails(@Param('id') id: string) {
    return this.settlementsService.getSettlementDetails(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create manual settlement entry (Pending)' })
  async createSettlement(@Body() dto: CreateSettlementDto) {
    return this.settlementsService.createSettlement(dto);
  }

  @Patch(':id/pay')
  @ApiOperation({ summary: 'Mark settlement as Paid/Completed' })
  async markPaid(
    @Param('id') id: string,
    @Body() dto: MarkPaidDto,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.settlementsService.markAsPaid(id, dto, admin.adminId, ip);
  }
}
