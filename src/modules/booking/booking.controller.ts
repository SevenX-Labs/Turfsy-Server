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
  ParseUUIDPipe,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CronGuard } from '../../common/guards/cron.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ResponseSanitizerInterceptor } from '../../common/interceptors/response-sanitizer.interceptor';
import {
  CreateBookingDto,
  ConfirmPaymentDto,
  VerifyPinDto,
  RateTurfDto,
  CancelBookingDto,
} from './dto/booking.dto';

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
  @HttpCode(HttpStatus.CREATED)
  async createBooking(
    @Req() req: any,
    @Body() dto: CreateBookingDto,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.createBooking(req.user.authId, dto, ip);
  }

  // ──────────────────────────────────────────────
  // 2. CREATE RAZORPAY ORDER (User)
  // POST /api/v3/booking/:bookingId/create-order
  // Layer 1: JWT Auth | Layer 10: UUID Validation
  // ──────────────────────────────────────────────
  @Post(':bookingId/create-order')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async createOrder(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.createRazorpayOrder(req.user.authId, bookingId, ip);
  }

  // ──────────────────────────────────────────────
  // 3. VERIFY PAYMENT & CONFIRM BOOKING (User)
  // POST /api/v3/booking/:bookingId/confirm-payment
  // Layer 1: JWT | Layer 3: Signature | Layer 10: DTO
  // ──────────────────────────────────────────────
  @Post(':bookingId/confirm-payment')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async confirmPayment(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
    @Body() dto: ConfirmPaymentDto,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.confirmOnlinePayment(req.user.authId, bookingId, dto, ip);
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
    return this.bookingService.failOnlinePayment(req.user.authId, bookingId, ip);
  }

  // ──────────────────────────────────────────────
  // 5. VERIFY CASH PIN (Owner only)
  // POST /api/v3/booking/:bookingId/verify-pin
  // Layer 1: JWT + OWNER role | Layer 8: PIN security
  // ──────────────────────────────────────────────
  @Post(':bookingId/verify-pin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @HttpCode(HttpStatus.OK)
  async verifyPin(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
    @Body() dto: VerifyPinDto,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.verifyCheckInPin(req.user.authId, bookingId, dto.pin, ip);
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
  // 7. CANCEL BOOKING (User)
  // PATCH /api/v3/booking/:bookingId/cancel
  // Layer 1: JWT | Layer 9: Refund safety
  // ──────────────────────────────────────────────
  @Patch(':bookingId/cancel')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async cancelBooking(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
    @Body() dto: CancelBookingDto,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.cancelBooking(req.user.authId, bookingId, dto.reason, ip);
  }

  // ──────────────────────────────────────────────
  // 8. CRON: MARK NO SHOWS
  // POST /api/v3/booking/cron/no-shows
  // Layer 1: CronGuard (X-Cron-Secret, no JWT)
  // ──────────────────────────────────────────────
  @Post('cron/no-shows')
  @UseGuards(CronGuard)
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
  @Post('cron/auto-complete')
  @UseGuards(CronGuard)
  @HttpCode(HttpStatus.OK)
  async cronAutoComplete(@Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.bookingService.autoCompleteOnlineBookings(ip);
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
  // 11. GET ALL MY BOOKINGS (User)
  // GET /api/v3/booking/my-bookings
  // ──────────────────────────────────────────────
  @Get('my-bookings')
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
        throw new BadRequestException('filter must be "today", "tomorrow", or "week"');
      }
      return this.bookingService.getBookingsByFilter(req.user.authId, filter, date);
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

  // ──────────────────────────────────────────────
  // 15. GET SINGLE BOOKING DETAILS
  // GET /api/v3/booking/my-bookings/:bookingId
  // ──────────────────────────────────────────────
  @Get('my-bookings/:bookingId')
  @UseGuards(JwtAuthGuard)
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
      throw new BadRequestException('date query parameter is required (YYYY-MM-DD)');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
    }
    return this.bookingService.getBookedSlots(turfId, date, req.user.authId);
  }
}
