import { Controller, Get, Put, Body, UseGuards, Req } from '@nestjs/common';
import { AdminSettingsService } from './admin-settings.service';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { CurrentAdmin } from '../auth/decorators/admin.decorator';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin Settings')
@Controller('api/v1/admin/settings')
@UseGuards(JwtAdminGuard)
@ApiBearerAuth()
export class AdminSettingsController {
  constructor(private readonly settingsService: AdminSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get platform-wide settings' })
  async getSettings() {
    return this.settingsService.getSettings();
  }

  @Put()
  @ApiOperation({ summary: 'Update platform-wide settings' })
  async updateSettings(
    @Body() dto: UpdateSettingsDto,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.settingsService.updateSettings(dto, admin.adminId, ip);
  }
}
