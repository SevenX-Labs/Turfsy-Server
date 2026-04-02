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
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v3/booking')
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // ──────────────────────────────────────────────
  // 1. CREATE BOOKING
  // POST /api/v3/booking
  // ──────────────────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createBooking(
    @Req() req: any,
    @Body()
    body: {
      turfId: string;
      bookingDate: string;
      startTime: string;
      endTime: string;
      durationMins: number;
      paymentType: 'ONLINE' | 'CASH';
      notes?: string;
    },
  ) {
    const { turfId, bookingDate, startTime, endTime, durationMins, paymentType, notes } = body;

    if (!turfId || !bookingDate || !startTime || !endTime || !durationMins || !paymentType) {
      throw new BadRequestException('Missing required booking fields');
    }

    if (!['ONLINE', 'CASH'].includes(paymentType)) {
      throw new BadRequestException('paymentType must be ONLINE or CASH');
    }

    return this.bookingService.createBooking(req.user.authId, {
      turfId, bookingDate, startTime, endTime, durationMins, paymentType, notes,
    });
  }

  // ──────────────────────────────────────────────
  // 2. CREATE RAZORPAY ORDER
  // POST /api/v3/booking/:bookingId/create-order
  // ──────────────────────────────────────────────
  @Post(':bookingId/create-order')
  @HttpCode(HttpStatus.OK)
  async createOrder(
    @Req() req: any,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookingService.createRazorpayOrder(req.user.authId, bookingId);
  }

  // ──────────────────────────────────────────────
  // 3. VERIFY PAYMENT & CONFIRM BOOKING
  // POST /api/v3/booking/:bookingId/confirm-payment
  // ──────────────────────────────────────────────
  @Post(':bookingId/confirm-payment')
  @HttpCode(HttpStatus.OK)
  async confirmPayment(
    @Req() req: any,
    @Param('bookingId') bookingId: string,
    @Body() body: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  ) {
    if (!body.razorpayOrderId || !body.razorpayPaymentId || !body.razorpaySignature) {
      throw new BadRequestException('razorpayOrderId, razorpayPaymentId, and razorpaySignature are required');
    }
    return this.bookingService.confirmOnlinePayment(req.user.authId, bookingId, body);
  }

  // ──────────────────────────────────────────────
  // 3. MARK PAYMENT FAILED
  // POST /api/v3/booking/:bookingId/payment-failed
  // ──────────────────────────────────────────────
  @Post(':bookingId/payment-failed')
  @HttpCode(HttpStatus.OK)
  async paymentFailed(
    @Req() req: any,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookingService.failOnlinePayment(req.user.authId, bookingId);
  }

  // ──────────────────────────────────────────────
  // 4. VERIFY CASH PIN (Owner side)
  // POST /api/v3/booking/:bookingId/verify-pin
  // ──────────────────────────────────────────────
  @Post(':bookingId/verify-pin')
  @HttpCode(HttpStatus.OK)
  async verifyPin(
    @Req() req: any,
    @Param('bookingId') bookingId: string,
    @Body() body: { pin: string },
  ) {
    if (!body.pin) throw new BadRequestException('PIN is required');
    return this.bookingService.verifyCheckInPin(req.user.authId, bookingId, body.pin);
  }

  // ──────────────────────────────────────────────
  // 5. MARK BOOKING COMPLETED (Owner side)
  // PATCH /api/v3/booking/:bookingId/complete
  // ──────────────────────────────────────────────
  @Patch(':bookingId/complete')
  @HttpCode(HttpStatus.OK)
  async completeBooking(
    @Req() req: any,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookingService.completeBooking(req.user.authId, bookingId);
  }

  // ──────────────────────────────────────────────
  // 6. CANCEL BOOKING
  // PATCH /api/v3/booking/:bookingId/cancel
  // ──────────────────────────────────────────────
  @Patch(':bookingId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelBooking(
    @Req() req: any,
    @Param('bookingId') bookingId: string,
    @Body() body: { reason?: string },
  ) {
    return this.bookingService.cancelBooking(req.user.authId, bookingId, body.reason);
  }

  // ──────────────────────────────────────────────
  // 6.5 CRON: TRIGGER NO_SHOWS
  // POST /api/v3/booking/cron/no-shows
  // ──────────────────────────────────────────────
  @Post('cron/no-shows')
  @HttpCode(HttpStatus.OK)
  async cronMarkNoShows() {
    return this.bookingService.markNoShows();
  }

  // ──────────────────────────────────────────────
  // 6.6 CRON: AUTO-COMPLETE ONLINE BOOKINGS
  // POST /api/v3/booking/cron/auto-complete
  // ──────────────────────────────────────────────
  @Post('cron/auto-complete')
  @HttpCode(HttpStatus.OK)
  async cronAutoComplete() {
    return this.bookingService.autoCompleteOnlineBookings();
  }

  // ──────────────────────────────────────────────
  // 7. RATE TURF
  // POST /api/v3/booking/my-bookings/:bookingId/rateTurf
  // ──────────────────────────────────────────────
  @Post('my-bookings/:bookingId/rateTurf')
  @HttpCode(HttpStatus.CREATED)
  async rateTurf(
    @Req() req: any,
    @Param('bookingId') bookingId: string,
    @Body() body: { rating: number; review?: string },
  ) {
    if (!body.rating) throw new BadRequestException('rating is required (1-5)');
    return this.bookingService.rateTurf(req.user.authId, bookingId, body);
  }

  // ──────────────────────────────────────────────
  // 8. GET ALL MY BOOKINGS
  // GET /api/v3/booking/my-bookings
  // ──────────────────────────────────────────────
  @Get('my-bookings')
  @HttpCode(HttpStatus.OK)
  async getMyBookings(@Req() req: any) {
    return this.bookingService.getMyBookings(req.user.authId);
  }

  // ──────────────────────────────────────────────
  // 9. BOOKINGS BY STATUS & FILTER
  // GET /api/v3/booking/my-bookings/bookings?status=upcoming
  // GET /api/v3/booking/my-bookings/bookings?status=past
  // GET /api/v3/booking/my-bookings/bookings?filter=today
  // GET /api/v3/booking/my-bookings/bookings?filter=tomorrow
  // GET /api/v3/booking/my-bookings/bookings?filter=week
  // GET /api/v3/booking/my-bookings/bookings?date=2024-02-22
  // ──────────────────────────────────────────────
  @Get('my-bookings/bookings')
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
  // 10. TRANSACTION HISTORY
  // GET /api/v3/booking/transaction-history
  // ──────────────────────────────────────────────
  @Get('transaction-history')
  @HttpCode(HttpStatus.OK)
  async getTransactionHistory(@Req() req: any) {
    return this.bookingService.getTransactionHistory(req.user.authId);
  }

  // ──────────────────────────────────────────────
  // 11. INVOICE
  // GET /api/v3/booking/my-bookings/:bookingId/invoice
  // ──────────────────────────────────────────────
  @Get('my-bookings/:bookingId/invoice')
  @HttpCode(HttpStatus.OK)
  async getInvoice(
    @Req() req: any,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookingService.getInvoice(req.user.authId, bookingId);
  }

  // ──────────────────────────────────────────────
  // 12. GET SINGLE BOOKING DETAILS
  // GET /api/v3/booking/my-bookings/:bookingId
  // ──────────────────────────────────────────────
  @Get('my-bookings/:bookingId')
  @HttpCode(HttpStatus.OK)
  async getBookingDetails(
    @Req() req: any,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookingService.getBookingDetails(req.user.authId, bookingId);
  }
  // ──────────────────────────────────────────────
  // 13. GET TURF AVAILABILITY (BOOKED SLOTS)
  // GET /api/v3/booking/availability/:turfId?date=2026-04-05
  // ──────────────────────────────────────────────
  @Get('availability/:turfId')
  @HttpCode(HttpStatus.OK)
  async getAvailability(
    @Param('turfId') turfId: string,
    @Query('date') date: string,
  ) {
    if (!date) {
      throw new BadRequestException('date query parameter is required (YYYY-MM-DD)');
    }
    return this.bookingService.getBookedSlots(turfId, date);
  }
}
