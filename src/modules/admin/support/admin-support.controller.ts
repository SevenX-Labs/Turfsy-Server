import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards, Req } from '@nestjs/common';
import { AdminSupportService } from './admin-support.service';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { CurrentAdmin } from '../auth/decorators/admin.decorator';
import type { Request } from 'express';
import { TicketStatus, TicketPriority } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin Support')
@Controller('api/v1/admin/support')
@UseGuards(JwtAdminGuard)
@ApiBearerAuth()
export class AdminSupportController {
  constructor(private readonly supportService: AdminSupportService) {}

  @Get('tickets')
  @ApiOperation({ summary: 'List and filter all support tickets' })
  async getTickets(
    @Query('status') status?: TicketStatus,
    @Query('priority') priority?: TicketPriority,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.supportService.listTickets({ status, priority, page, limit });
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get details and replies for a support ticket' })
  async getTicket(@Param('id') id: string) {
    return this.supportService.getTicket(id);
  }

  @Patch('tickets/:id/assign')
  @ApiOperation({ summary: 'Assign ticket to an admin staff' })
  async assignTicket(
    @Param('id') id: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.supportService.assignTicket(id, dto.adminId);
  }

  @Post('tickets/:id/reply')
  @ApiOperation({ summary: 'Reply to support ticket' })
  async reply(
    @Param('id') id: string,
    @Body() dto: ReplyTicketDto,
    @CurrentAdmin() admin: any,
  ) {
    return this.supportService.replyToTicket(id, dto.message, admin.adminId);
  }

  @Patch('tickets/:id/resolve')
  @ApiOperation({ summary: 'Resolve support ticket' })
  async resolve(
    @Param('id') id: string,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.supportService.resolveTicket(id, admin.adminId, ip);
  }

  @Patch('tickets/:id/close')
  @ApiOperation({ summary: 'Close support ticket' })
  async close(
    @Param('id') id: string,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.supportService.closeTicket(id, admin.adminId, ip);
  }
}
