import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminDashboardService } from './admin-dashboard.service';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin Dashboard')
@Controller('api/v1/admin/dashboard')
@UseGuards(JwtAdminGuard)
@ApiBearerAuth()
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Get Super Admin dashboard analytics and metrics' })
  async getDashboard() {
    return this.dashboardService.getDashboardStats();
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Get revenue stats (today, weekly, monthly)' })
  async getRevenueStats() {
    return this.dashboardService.getRevenueStats();
  }

  @Get('charts')
  @ApiOperation({
    summary: 'Get chart data series (bookings, revenue, user/owner growth)',
  })
  async getChartData() {
    return this.dashboardService.getChartData();
  }

  @Get('recent-bookings')
  @ApiOperation({ summary: 'Get recent bookings (paginated)' })
  async getRecentBookings(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.dashboardService.getRecentBookings({ page, limit });
  }
}
