import {
  Controller,
  Get,
  Patch,
  Post,
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
import { AuthService } from '../auth/auth.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

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

  // --- Logout ---
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req: any) {
    return this.authService.logout(req.user.sessionId);
  }
}
