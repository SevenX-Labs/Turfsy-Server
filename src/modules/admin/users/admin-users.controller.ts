import { Controller, Get, Post, Delete, Patch, Param, Query, Body, UseGuards, Req, Res } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';
import { SuspendUserDto } from './dto/suspend.dto';
import { CurrentAdmin } from '../auth/decorators/admin.decorator';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin Users')
@Controller('api/v1/admin/users')
@UseGuards(JwtAdminGuard)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'List and filter users' })
  async getUsers(
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'suspended' | 'deleted',
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.listUsers({ search, status, page, limit });
  }

  @Get('export/csv')
  @ApiOperation({ summary: 'Export users to CSV file' })
  async exportCsv(@Res() res: Response) {
    const csv = await this.usersService.exportUsersCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=users.csv');
    return res.status(200).send(csv);
  }

  @Get('export/pdf')
  @ApiOperation({ summary: 'Export users list to PDF' })
  async exportPdf(@Res() res: Response) {
    const buffer = await this.usersService.exportUsersPdf();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=users_report.pdf');
    return res.status(200).send(buffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get detailed profile and statistics for a specific user' })
  async getUserDetails(@Param('id') id: string) {
    return this.usersService.getUserDetails(id);
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspend user account' })
  async suspendUser(
    @Param('id') id: string,
    @Body() dto: SuspendUserDto,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.usersService.suspendUser(id, dto.reason, admin.adminId, ip);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate suspended user account' })
  async activateUser(
    @Param('id') id: string,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.usersService.activateUser(id, admin.adminId, ip);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete user account' })
  async deleteUser(
    @Param('id') id: string,
    @CurrentAdmin() admin: any,
    @Req() req: Request,
  ) {
    const ip = req.ip || '127.0.0.1';
    return this.usersService.softDeleteUser(id, admin.adminId, ip);
  }

  @Get(':id/bookings')
  @ApiOperation({ summary: 'Get booking history for a specific user' })
  async getBookingHistory(@Param('id') id: string) {
    return this.usersService.getBookingHistory(id);
  }
}
