import { Controller, Post, Body, Req, Get, UseGuards } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/login.dto';
import type { Request } from 'express';
import { JwtAdminGuard } from './guards/jwt-admin.guard';
import { CurrentAdmin } from './decorators/admin.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin Auth')
@Controller('api/v1/admin/auth')
export class AdminAuthController {
  constructor(private readonly authService: AdminAuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Admin login' })
  async login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    const ip = req.ip || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return this.authService.login(dto, ip, userAgent);
  }

  @Post('logout')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin logout' })
  async logout(@CurrentAdmin() admin: any, @Req() req: Request) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.split(' ')[1];
    const ip = req.ip || '127.0.0.1';
    return this.authService.logout(token, admin.adminId, ip);
  }

  @Get('me')
  @UseGuards(JwtAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated admin details' })
  async me(@CurrentAdmin() admin: any) {
    return { success: true, data: admin };
  }
}
