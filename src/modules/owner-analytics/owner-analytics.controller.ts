import {
    Controller,
    Get,
    Req,
    Query,
    UseGuards
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerAnalyticsService } from './owner-analytics.service';

@Controller('api/v3/owner-analytics')
export class OwnerAnalyticsController {
  constructor(private readonly ownerAnalyticsService: OwnerAnalyticsService) {}

  @Get('overall')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getOverall(@Req() req: any) {
    return this.ownerAnalyticsService.getOverallAnalytics(req.user.authId);
  }

  @Get('total-revenue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getTotalRevenue(@Req() req: any) {
    return this.ownerAnalyticsService.getTotalRevenue(req.user.authId);
  }

  @Get('total-bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getTotalBookings(@Req() req: any) {
    return this.ownerAnalyticsService.getTotalBookings(req.user.authId);
  }

  @Get('completed-bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getCompletedBookings(@Req() req: any) {
    return this.ownerAnalyticsService.getCompletedBookings(req.user.authId);
  }

  @Get('cancelled-bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getCancelledBookings(@Req() req: any) {
    return this.ownerAnalyticsService.getCancelledBookings(req.user.authId);
  }

  @Get('revenue-by-date')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getRevenueByDate(@Req() req: any) {
    return this.ownerAnalyticsService.getRevenueByDate(req.user.authId);
  }

  @Get('bookings-by-date')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getBookingsByDate(@Req() req: any) {
    return this.ownerAnalyticsService.getBookingsByDate(req.user.authId);
  }

  @Get('cash-vs-online')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getCashVsOnline(@Req() req: any) {
    return this.ownerAnalyticsService.getCashVsOnline(req.user.authId);
  }

  @Get('peak-hours')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getPeakHours(@Req() req: any) {
    return this.ownerAnalyticsService.getPeakHours(req.user.authId);
  }

  @Get('cancellation-rate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getCancellationRate(@Req() req: any) {
    return this.ownerAnalyticsService.getCancellationRate(req.user.authId);
  }

  @Get('no-show-rate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getNoShowRate(@Req() req: any) {
    return this.ownerAnalyticsService.getNoShowRate(req.user.authId);
  }

  @Get('reviews-ratings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getReviewsAndRatings(@Req() req: any) {
    return this.ownerAnalyticsService.getReviewsAndRatings(req.user.authId);
  }

  @Get('total-venues')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getTotalVenues(@Req() req: any) {
    return this.ownerAnalyticsService.getTotalVenues(req.user.authId);
  }

  @Get('venues-ratings-summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async getVenuesAndRatingsSummary(@Req() req: any, @Query('turfId') turfId?: string) {
    return this.ownerAnalyticsService.getVenuesAndRatingsSummary(
      req.user.authId,
      turfId,
    );
  }
}
