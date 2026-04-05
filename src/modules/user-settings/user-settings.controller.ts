import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserSettingsService } from './user-settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateUserPaymentSettingsDto } from './dto/payment-settings.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ChangePhoneDto } from './dto/change-phone.dto';
import { UpdateUserPreferencesDto } from './dto/preferences.dto';
import { UpdateUserNotificationSettingsDto } from './dto/notification-settings.dto';

@Controller('api/v3/user-settings')
@UseGuards(JwtAuthGuard)
export class UserSettingsController {
  constructor(private readonly userSettingsService: UserSettingsService) {}

  @Get('payment')
  @HttpCode(HttpStatus.OK)
  getPaymentSettings(@Req() req: any) {
    return this.userSettingsService.getPaymentSettings(req.user.authId);
  }

  @Patch('payment')
  @HttpCode(HttpStatus.OK)
  updatePaymentSettings(
    @Req() req: any,
    @Body() dto: UpdateUserPaymentSettingsDto,
  ) {
    return this.userSettingsService.updatePaymentSettings(req.user.authId, dto);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.userSettingsService.changePassword(req.user.authId, dto);
  }

  @Post('change-phone')
  @HttpCode(HttpStatus.OK)
  changePhone(@Req() req: any, @Body() dto: ChangePhoneDto) {
    return this.userSettingsService.changePhone(req.user.authId, dto);
  }

  @Get('preferences')
  @HttpCode(HttpStatus.OK)
  getPreferences(@Req() req: any) {
    return this.userSettingsService.getPreferences(req.user.authId);
  }

  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  updatePreferences(@Req() req: any, @Body() dto: UpdateUserPreferencesDto) {
    return this.userSettingsService.updatePreferences(req.user.authId, dto);
  }

  @Get('notifications')
  @HttpCode(HttpStatus.OK)
  getNotifications(@Req() req: any) {
    return this.userSettingsService.getNotificationSettings(req.user.authId);
  }

  @Patch('notifications')
  @HttpCode(HttpStatus.OK)
  updateNotifications(
    @Req() req: any,
    @Body() dto: UpdateUserNotificationSettingsDto,
  ) {
    return this.userSettingsService.updateNotificationSettings(
      req.user.authId,
      dto,
    );
  }
}
