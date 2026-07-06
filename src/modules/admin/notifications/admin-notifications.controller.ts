import { Controller, Post, Get, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AdminNotificationsService } from './admin-notifications.service';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';
import { BroadcastNotificationDto } from './dto/broadcast-notification.dto';
import { CurrentAdmin } from '../auth/decorators/admin.decorator';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin Notifications')
@Controller('api/v1/admin/notifications')
@UseGuards(JwtAdminGuard)
@ApiBearerAuth()
export class AdminNotificationsController {
  constructor(private readonly notificationsService: AdminNotificationsService) {}

  @Post('broadcast')
  @ApiOperation({ summary: 'Broadcast push notifications to all users, owners, or by city' })
  async broadcast(
    @Body() dto: BroadcastNotificationDto,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.notificationsService.broadcast(dto, admin.adminId, ip);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get broadcast notifications logs history' })
  async getHistory(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.notificationsService.getNotificationHistory(Number(page) || 1, Number(limit) || 10);
  }
}
