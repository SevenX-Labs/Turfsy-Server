
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Res,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import type { Request } from 'express';
import { BookingService } from './booking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CronGuard } from '../../common/guards/cron.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ResponseSanitizerInterceptor } from '../../common/interceptors/response-sanitizer.interceptor';
import {
  CreateBookingDto,
  ConfirmPaymentDto,
  VerifyQrDto,
  RateTurfDto,
  CancelBookingDto,
  RebookBookingDto,
} from './dto/booking.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Bookings')
@ApiBearerAuth('JWT-auth')
@Controller('api/v3/booking')
@UseInterceptors(ResponseSanitizerInterceptor)
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // ──────────────────────────────────────────────
  // 1. CREATE BOOKING (User)
  // POST /api/v3/booking
  // Layer 1: JWT Auth | Layer 10: DTO Validation
  // ──────────────────────────────────────────────
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async createBooking(@Req() req: any, @Body() dto: CreateBookingDto) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.createBooking(req.user.authId, dto, ip);
  }

  @Post('pay-at-turf')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async createPayAtTurfBooking(@Req() req: any, @Body() dto: CreateBookingDto) {
    const ip = req.ip || req.connection?.remoteAddress;
    // Enforce FULL_CASH type for this route
    dto.paymentType = 'FULL_CASH';
    return this.bookingService.createBooking(req.user.authId, dto, ip);
  }

  // ──────────────────────────────────────────────
  // 1.5 REBOOK (User)
  // POST /api/v3/booking/:bookingId/rebook
  // ──────────────────────────────────────────────
  @Post(':bookingId/rebook')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async rebook(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
    @Body() dto: RebookBookingDto,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.rebook(req.user.authId, bookingId, dto, ip);
  }

  // ──────────────────────────────────────────────
  // 2. CREATE RAZORPAY ORDER (User)
  // POST /api/v3/booking/:bookingId/create-order
  // Layer 1: JWT Auth | Layer 10: UUID Validation
  // ──────────────────────────────────────────────
  @Post(':bookingId/create-order')
  @UseGuards(JwtAuthGuard)
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async createOrder(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.createRazorpayOrder(
      req.user.authId,
      bookingId,
      ip,
    );
  }

  // ──────────────────────────────────────────────
  // 3. VERIFY PAYMENT & CONFIRM BOOKING (User)
  // POST /api/v3/booking/:bookingId/confirm-payment
  // Layer 1: JWT | Layer 3: Signature | Layer 10: DTO
  // ──────────────────────────────────────────────
  @Post(':bookingId/confirm-payment')
  @UseGuards(JwtAuthGuard)
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async confirmPayment(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
    @Body() dto: ConfirmPaymentDto,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.confirmOnlinePayment(
      req.user.authId,
      bookingId,
      dto,
      ip,
    );
  }

  @Post('razorpay/webhook')
  @SkipThrottle() // Webhook uses signature-based auth, not rate-limited
  @HttpCode(HttpStatus.OK)
  async razorpayWebhook(@Req() req: Request, @Body() body: any) {
    const signatureHeader = req.headers['x-razorpay-signature'];
    const signature =
      typeof signatureHeader === 'string'
        ? signatureHeader
        : Array.isArray(signatureHeader)
          ? signatureHeader[0]
          : undefined;
    const ip = req.ip || req.connection?.remoteAddress;
    const rawBody = (req as any).rawBody as Buffer | undefined;

    return this.bookingService.handleRazorpayWebhook(
      body,
      signature,
      rawBody,
      ip,
    );
  }

  // ──────────────────────────────────────────────
  // 4. MARK PAYMENT FAILED (User)
  // POST /api/v3/booking/:bookingId/payment-failed
  // ──────────────────────────────────────────────
  @Post(':bookingId/payment-failed')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async paymentFailed(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.failOnlinePayment(
      req.user.authId,
      bookingId,
      ip,
    );
  }

  // ──────────────────────────────────────────────
  // 5. VERIFY QR CODE (Owner only)
  // POST /api/v3/booking/verify-qr
  // Layer 1: JWT + OWNER role
  // ──────────────────────────────────────────────
  @Post('verify-qr')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Throttle({ strict: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async verifyQr(
    @Req() req: any,
    @Body() dto: VerifyQrDto,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.verifyCheckInQr(
      req.user.authId,
      dto.qrData,
      ip,
    );
  }

  // ──────────────────────────────────────────────
  // 6. MARK BOOKING COMPLETED (Owner only, ONLINE)
  // PATCH /api/v3/booking/:bookingId/complete
  // Layer 1: JWT + OWNER role
  // ──────────────────────────────────────────────
  @Patch(':bookingId/complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @HttpCode(HttpStatus.OK)
  async completeBooking(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.completeBooking(req.user.authId, bookingId, ip);
  }

  // ──────────────────────────────────────────────
  // 5.1 OWNER: APPROVE BOOKING REQUEST
  // POST /api/v3/booking/owner/bookings/:bookingId/approve
  // ──────────────────────────────────────────────
  @Post('owner/bookings/:bookingId/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @HttpCode(HttpStatus.OK)
  async approveBooking(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
  ) {
    return this.bookingService.approveBooking(req.user.authId, bookingId);
  }

  // ──────────────────────────────────────────────
  // 5.2 OWNER: REJECT BOOKING REQUEST
  // POST /api/v3/booking/owner/bookings/:bookingId/reject
  // ──────────────────────────────────────────────
  @Post('owner/bookings/:bookingId/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @HttpCode(HttpStatus.OK)
  async rejectBooking(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
  ) {
    return this.bookingService.rejectBooking(req.user.authId, bookingId);
  }

  // ──────────────────────────────────────────────
  // 6.1 OWNER: GET ALL BOOKINGS
  // GET /api/v3/booking/owner/bookings
  // ──────────────────────────────────────────────
  @Get('owner/bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @HttpCode(HttpStatus.OK)
  async getOwnerBookings(@Req() req: any) {
    return this.bookingService.getOwnerBookings(req.user.authId);
  }

  // ──────────────────────────────────────────────
  // 6.2 OWNER: FILTERED BOOKINGS
  // GET /api/v3/booking/owner/bookings-filtered
  // ──────────────────────────────────────────────
  @Get('owner/bookings-filtered')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @HttpCode(HttpStatus.OK)
  async getOwnerBookingsFiltered(
    @Req() req: any,
    @Query('status') status?: 'upcoming' | 'past',
    @Query('time') time?: 'today' | 'tomorrow' | 'week',
    @Query('date') date?: string,
  ) {
    if (status && !['upcoming', 'past'].includes(status)) {
      throw new BadRequestException('status must be "upcoming" or "past"');
    }
    if (time && !['today', 'tomorrow', 'week'].includes(time)) {
      throw new BadRequestException(
        'time must be "today", "tomorrow", or "week"',
      );
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
    }
    return this.bookingService.getOwnerBookingsFiltered(req.user.authId, {
      status,
      time,
      date,
    });
  }

  // ──────────────────────────────────────────────
  // 6.3 OWNER: SINGLE BOOKING DETAILS
  // GET /api/v3/booking/owner/bookings/:bookingId
  // ──────────────────────────────────────────────
  @Get('owner/bookings/:bookingId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @HttpCode(HttpStatus.OK)
  async getOwnerBookingDetails(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
  ) {
    return this.bookingService.getOwnerBookingDetails(
      req.user.authId,
      bookingId,
    );
  }

  // ──────────────────────────────────────────────
  // 6.4 OWNER: ACTIVE BOOKINGS TODAY
  // GET /api/v3/booking/owner/bookings/active
  // ──────────────────────────────────────────────
  @Get('owner/bookings/active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @HttpCode(HttpStatus.OK)
  async getOwnerActiveBookings(@Req() req: any) {
    return this.bookingService.getOwnerActiveBookings(req.user.authId);
  }

  // ──────────────────────────────────────────────
  // 6.5 OWNER: ANALYTICS & REPORTS
  // ──────────────────────────────────────────────
  @Get('owner/analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @HttpCode(HttpStatus.OK)
  async getOwnerAnalytics(@Req() req: any) {
    return this.bookingService.getOwnerAnalytics(req.user.authId);
  }

  @Get('owner/analytics/csv')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async exportAnalyticsCsv(@Req() req: any, @Res() res: any) {
    const csv = await this.bookingService.getOwnerAnalyticsCsv(req.user.authId);
    res.header('Content-Type', 'text/csv');
    res.attachment(`turfsy_analytics_${new Date().getTime()}.csv`);
    return res.send(csv);
  }

  @Get('owner/analytics/pdf')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  async exportAnalyticsPdf(@Req() req: any, @Res() res: any) {
    const buffer = await this.bookingService.getOwnerAnalyticsPdf(
      req.user.authId,
    );
    res.header('Content-Type', 'application/pdf');
    res.attachment(`turfsy_report_${new Date().getTime()}.pdf`);
    return res.send(buffer);
  }

  // ──────────────────────────────────────────────
  // 7. CANCEL BOOKING (User)
  // PATCH /api/v3/booking/:bookingId/cancel
  // Layer 1: JWT | Layer 9: Refund safety
  // ──────────────────────────────────────────────
  @Patch(':bookingId/cancel')
  @UseGuards(JwtAuthGuard)
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async cancelBooking(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
    @Body() dto: CancelBookingDto,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.cancelBooking(
      req.user.authId,
      bookingId,
      dto.reason,
      ip,
    );
  }

  // ──────────────────────────────────────────────
  // 8. CRON: MARK NO SHOWS
  // POST /api/v3/booking/cron/no-shows
  // Layer 1: CronGuard (X-Cron-Secret, no JWT)
  // ──────────────────────────────────────────────
  @Post('cron/no-shows')
  @UseGuards(CronGuard)
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async cronMarkNoShows(@Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.markNoShows(ip);
  }

  // ──────────────────────────────────────────────
  // 9. CRON: AUTO-COMPLETE ONLINE BOOKINGS
  // POST /api/v3/booking/cron/auto-complete
  // Layer 1: CronGuard
  // ──────────────────────────────────────────────
  @Post('cron/upcoming-checkins')
  @UseGuards(CronGuard)
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async cronUpcomingCheckins(@Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.handleUpcomingCheckInNotifications(ip);
  }

  // ──────────────────────────────────────────────
  // 10. RATE TURF (User)
  // POST /api/v3/booking/my-bookings/:bookingId/rateTurf
  // Layer 2: Idempotency | Layer 10: DTO validation
  // ──────────────────────────────────────────────
  @Post('my-bookings/:bookingId/rateTurf')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async rateTurf(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
    @Body() dto: RateTurfDto,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.rateTurf(req.user.authId, bookingId, dto, ip);
  }

  // ──────────────────────────────────────────────
  // 10.5 GET ACTIVE BOOKING TODAY (User)
  // GET /api/v3/booking/my-bookings/active
  // ──────────────────────────────────────────────
  @Get('my-bookings/active')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getActiveBooking(@Req() req: any) {
    return this.bookingService.getActiveBookingToday(req.user.authId);
  }

  // ──────────────────────────────────────────────
  // 11. GET ALL MY BOOKINGS (User)
  // GET /api/v3/booking/my-bookings
  // ──────────────────────────────────────────────
  @Get('my-bookings')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMyBookings(@Req() req: any) {
    return this.bookingService.getMyBookings(req.user.authId);
  }

  // ──────────────────────────────────────────────
  // 12. BOOKINGS BY STATUS & FILTER
  // GET /api/v3/booking/my-bookings/bookings
  // ──────────────────────────────────────────────
  @Get('my-bookings/bookings')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getBookingsFiltered(
    @Req() req: any,
    @Query('status') status?: 'upcoming' | 'past',
    @Query('filter') filter?: 'today' | 'tomorrow' | 'week',
    @Query('date') date?: string,
  ) {
    if (status) {
      if (!['upcoming', 'past'].includes(status)) {
        throw new BadRequestException('status must be "upcoming" or "past"');
      }
      return this.bookingService.getBookingsByStatus(req.user.authId, status);
    }

    if (filter || date) {
      if (filter && !['today', 'tomorrow', 'week'].includes(filter)) {
        throw new BadRequestException(
          'filter must be "today", "tomorrow", or "week"',
        );
      }
      return this.bookingService.getBookingsByFilter(
        req.user.authId,
        filter,
        date,
      );
    }

    return this.bookingService.getMyBookings(req.user.authId);
  }

  // ──────────────────────────────────────────────
  // 13. TRANSACTION HISTORY
  // GET /api/v3/booking/transaction-history
  // ──────────────────────────────────────────────
  @Get('transaction-history')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getTransactionHistory(@Req() req: any) {
    return this.bookingService.getTransactionHistory(req.user.authId);
  }

  // ──────────────────────────────────────────────
  // 14. INVOICE
  // GET /api/v3/booking/my-bookings/:bookingId/invoice
  // ──────────────────────────────────────────────
  @Get('my-bookings/:bookingId/invoice')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getInvoice(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
  ) {
    return this.bookingService.getInvoice(req.user.authId, bookingId);
  }

  @Get('my-bookings/:bookingId/invoice/pdf')
  @UseGuards(JwtAuthGuard)
  async downloadInvoicePdf(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
    @Res() res: any,
  ) {
    const buffer = await this.bookingService.getInvoicePdf(
      req.user.authId,
      bookingId,
    );
    res.header('Content-Type', 'application/pdf');
    res.attachment(`turfsy_invoice_${bookingId.slice(0, 8)}.pdf`);
    return res.send(buffer);
  }

  // ──────────────────────────────────────────────
  // 15. GET SINGLE BOOKING DETAILS
  // GET /api/v3/booking/my-bookings/:bookingId
  // ──────────────────────────────────────────────
  @Get('my-bookings/:bookingId')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async getBookingDetails(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
  ) {
    return this.bookingService.getBookingDetails(req.user.authId, bookingId);
  }

  // ──────────────────────────────────────────────
  // 16. GET TURF AVAILABILITY
  // GET /api/v3/booking/availability/:turfId
  // ──────────────────────────────────────────────
  @Get('availability/:turfId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getAvailability(
    @Req() req: any,
    @Param('turfId', new ParseUUIDPipe({ version: '4' })) turfId: string,
    @Query('date') date: string,
  ) {
    if (!date) {
      throw new BadRequestException(
        'date query parameter is required (YYYY-MM-DD)',
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
    }
    return this.bookingService.getBookedSlots(turfId, date, req.user.authId);
  }

  @Get('email-test')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async testEmail(@Req() req: any) {
    return this.bookingService.sendTestEmail(req.user.authId);
  }
}
