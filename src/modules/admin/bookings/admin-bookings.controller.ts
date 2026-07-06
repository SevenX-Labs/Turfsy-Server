import { Controller, Get, Patch, Param, Query, UseGuards, Req, Res } from '@nestjs/common';
import { AdminBookingsService } from './admin-bookings.service';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';
import { CurrentAdmin } from '../auth/decorators/admin.decorator';
import type { Request, Response } from 'express';
import { BookingStatus, PaymentStatus } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin Bookings')
@Controller('api/v1/admin/bookings')
@UseGuards(JwtAdminGuard)
@ApiBearerAuth()
export class AdminBookingsController {
  constructor(private readonly bookingsService: AdminBookingsService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter all bookings' })
  async getBookings(
    @Query('search') search?: string,
    @Query('bookingStatus') bookingStatus?: BookingStatus,
    @Query('paymentStatus') paymentStatus?: PaymentStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.bookingsService.listBookings({ search, bookingStatus, paymentStatus, page, limit });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get aggregate booking statistics counts' })
  async getStats() {
    return this.bookingsService.getBookingStats();
  }

  @Get('export/csv')
  @ApiOperation({ summary: 'Export bookings to CSV file' })
  async exportCsv(
    @Query('search') search: string,
    @Query('bookingStatus') bookingStatus: BookingStatus,
    @Query('paymentStatus') paymentStatus: PaymentStatus,
    @Res() res: Response,
  ) {
    const csv = await this.bookingsService.exportBookingsCsv({ search, bookingStatus, paymentStatus });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=bookings.csv');
    return res.status(200).send(csv);
  }

  @Get('export/pdf')
  @ApiOperation({ summary: 'Export bookings list to PDF' })
  async exportPdf(
    @Query('search') search: string,
    @Query('bookingStatus') bookingStatus: BookingStatus,
    @Query('paymentStatus') paymentStatus: PaymentStatus,
    @Res() res: Response,
  ) {
    const buffer = await this.bookingsService.exportBookingsPdf({ search, bookingStatus, paymentStatus });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=bookings_report.pdf');
    return res.status(200).send(buffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get booking details by ID' })
  async getBookingDetails(@Param('id') id: string) {
    return this.bookingsService.getBookingDetails(id);
  }

  @Patch(':id/no-show')
  @ApiOperation({ summary: 'Mark booking user as no-show' })
  async markNoShow(
    @Param('id') id: string,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.bookingsService.markAsNoShow(id, admin.adminId, ip);
  }
}
