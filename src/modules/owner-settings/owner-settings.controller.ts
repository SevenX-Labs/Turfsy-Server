import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OwnerSettingsService } from './owner-settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileSettingsDto } from './dto/profile-settings.dto';
import { UpdateTurfSettingsDto } from './dto/turf-settings.dto';
import { UpdatePaymentSettingsDto } from './dto/payment-settings.dto';
import { UpdateNotificationSettingsDto } from './dto/notification-settings.dto';
import { UpdateCancellationPolicyDto } from './dto/cancellation-policy.dto';
import {
  CreateMaintenanceDto,
  UpdateMaintenanceDto,
} from './dto/maintenance.dto';
import { AuthService } from '../auth/auth.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Owners')
@ApiBearerAuth('JWT-auth')
@Controller('api/v3/owner-settings')
@UseGuards(JwtAuthGuard)
export class OwnerSettingsController {
  constructor(
    private readonly ownerSettingsService: OwnerSettingsService,
    private readonly authService: AuthService,
  ) {}

  // --- Profile Settings ---
  @Get('profile')
  getProfileSettings(@Req() req: any) {
    return this.ownerSettingsService.getProfileSettings(req.user.authId);
  }

  @Patch('profile')
  updateProfileSettings(
    @Req() req: any,
    @Body() dto: UpdateProfileSettingsDto,
  ) {
    return this.ownerSettingsService.updateProfileSettings(
      req.user.authId,
      dto,
    );
  }

  // --- Turf Management (View / Edit Turf, Pricing, Images) ---
  @Get('turf/:turfId')
  getTurfSettings(@Req() req: any, @Param('turfId') turfId: string) {
    return this.ownerSettingsService.getTurfSettings(req.user.authId, turfId);
  }

  @Patch('turf/:turfId')
  updateTurfSettings(
    @Req() req: any,
    @Param('turfId') turfId: string,
    @Body() dto: UpdateTurfSettingsDto,
  ) {
    return this.ownerSettingsService.updateTurfSettings(
      req.user.authId,
      turfId,
      dto,
    );
  }

  // --- Payment Settings (UPI, Bank, Status) ---
  @Get('payment')
  getPaymentSettings(@Req() req: any) {
    return this.ownerSettingsService.getPaymentSettings(req.user.authId);
  }

  @Patch('payment')
  updatePaymentSettings(
    @Req() req: any,
    @Body() dto: UpdatePaymentSettingsDto,
  ) {
    return this.ownerSettingsService.updatePaymentSettings(
      req.user.authId,
      dto,
    );
  }

  // --- Payout Settings (Proxy to Payment) ---
  @Get('payout')
  getPayoutSettings(@Req() req: any) {
    return this.ownerSettingsService.getPaymentSettings(req.user.authId);
  }

  @Patch('payout')
  updatePayoutSettings(@Req() req: any, @Body() dto: UpdatePaymentSettingsDto) {
    return this.ownerSettingsService.updatePaymentSettings(
      req.user.authId,
      dto,
    );
  }

  // --- Notification Settings ---
  @Get('notifications')
  getNotificationSettings(@Req() req: any) {
    return this.ownerSettingsService.getNotificationSettings(req.user.authId);
  }

  @Patch('notifications')
  updateNotificationSettings(
    @Req() req: any,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.ownerSettingsService.updateNotificationSettings(
      req.user.authId,
      dto,
    );
  }

  // --- Cancellation Policy ---
  @Get('cancellation-policy/:turfId')
  getCancellationPolicy(@Req() req: any, @Param('turfId') turfId: string) {
    return this.ownerSettingsService.getCancellationPolicy(
      req.user.authId,
      turfId,
    );
  }

  @Patch('cancellation-policy/:turfId')
  updateCancellationPolicy(
    @Req() req: any,
    @Param('turfId') turfId: string,
    @Body() dto: UpdateCancellationPolicyDto,
  ) {
    return this.ownerSettingsService.updateCancellationPolicy(
      req.user.authId,
      turfId,
      dto,
    );
  }

  // --- Security (Change Password - Placeholder for OTP based) ---
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(@Req() req: any) {
    return this.ownerSettingsService.changePassword(req.user.authId);
  }

  // --- Support ---
  @Get('support')
  getSupport(@Req() req: any) {
    return this.ownerSettingsService.getSupportInfo(req.user.authId);
  }

  // --- Maintenance ---
  @Get('maintenance/:turfId')
  @ApiOperation({ summary: 'View all maintenance blocks for a Turf' })
  getMaintenanceBlocks(@Req() req: any, @Param('turfId') turfId: string) {
    return this.ownerSettingsService.getMaintenanceBlocks(
      req.user.authId,
      turfId,
    );
  }

  @Post('maintenance')
  @ApiOperation({ summary: 'Create maintenance block(s) for a Turf' })
  @HttpCode(HttpStatus.CREATED)
  createMaintenanceBlock(@Req() req: any, @Body() dto: CreateMaintenanceDto) {
    return this.ownerSettingsService.createMaintenanceBlock(
      req.user.authId,
      dto,
    );
  }

  @Patch('maintenance/:maintenanceId')
  @ApiOperation({ summary: 'Update a maintenance block' })
  updateMaintenanceBlock(
    @Req() req: any,
    @Param('maintenanceId') maintenanceId: string,
    @Body() dto: UpdateMaintenanceDto,
  ) {
    return this.ownerSettingsService.updateMaintenanceBlock(
      req.user.authId,
      maintenanceId,
      dto,
    );
  }

  @Delete('maintenance/:maintenanceId')
  @ApiOperation({ summary: 'Delete a maintenance block' })
  deleteMaintenanceBlock(
    @Req() req: any,
    @Param('maintenanceId') maintenanceId: string,
  ) {
    return this.ownerSettingsService.deleteMaintenanceBlock(
      req.user.authId,
      maintenanceId,
    );
  }

  // --- Logout ---
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: any) {
    return this.authService.logout(req.user.sessionId);
  }
}
