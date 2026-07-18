import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerHomeService } from './owner-home.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Owners')
@ApiBearerAuth('JWT-auth')
@Controller('api/v3/owner-home')
export class OwnerHomeController {
  constructor(private readonly ownerHomeService: OwnerHomeService) {}

  @Get('dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getDashboard(@Req() req: any) {
    return this.ownerHomeService.getDashboardStats(req.user.authId);
  }

  @Get('revenue-summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getRevenueSummary(@Req() req: any) {
    return this.ownerHomeService.getRevenueSummary(req.user.authId);
  }

  @Get('booking-statistics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getBookingStatistics(@Req() req: any) {
    return this.ownerHomeService.getBookingStatistics(req.user.authId);
  }

  @Get('recent-activity')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getRecentActivity(@Req() req: any) {
    return this.ownerHomeService.getRecentActivity(req.user.authId);
  }

  @Get('trends')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getTrends(@Req() req: any) {
    return this.ownerHomeService.getTrends(req.user.authId);
  }

  @Get('payment-distribution')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getPaymentDistribution(@Req() req: any) {
    return this.ownerHomeService.getPaymentDistribution(req.user.authId);
  }

  @Get('turf-performance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getTurfPerformance(@Req() req: any) {
    return this.ownerHomeService.getTurfPerformance(req.user.authId);
  }
}
