import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Role } from '@prisma/client';

@Controller('api/v3/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ═══════════════════════════════════════════
  //  USER APP ENDPOINTS — role auto-set to USER
  // ═══════════════════════════════════════════

  @Post('user/login')
  @HttpCode(HttpStatus.OK)
  async userLogin(
    @Body() dto: LoginDto,
    @Headers('x-forwarded-for') ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.login(dto, ip, userAgent, Role.USER);
  }

  @Post('user/verify-otp')
  @HttpCode(HttpStatus.OK)
  async userVerifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto, Role.USER);
  }

  @Post('user/resend-otp')
  @HttpCode(HttpStatus.OK)
  async userResendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  // ═══════════════════════════════════════════
  //  OWNER APP ENDPOINTS — role auto-set to OWNER
  // ═══════════════════════════════════════════

  @Post('owner/login')
  @HttpCode(HttpStatus.OK)
  async ownerLogin(
    @Body() dto: LoginDto,
    @Headers('x-forwarded-for') ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.login(dto, ip, userAgent, Role.OWNER);
  }

  @Post('owner/verify-otp')
  @HttpCode(HttpStatus.OK)
  async ownerVerifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto, Role.OWNER);
  }

  @Post('owner/resend-otp')
  @HttpCode(HttpStatus.OK)
  async ownerResendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  // ═══════════════════════════════════════════
  //  SHARED ENDPOINTS (both apps use these)
  // ═══════════════════════════════════════════

  // Logout — revoke session
  @Get('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: any) {
    return this.authService.logout(req.user.sessionId);
  }

  // Soft delete account
  @Delete('delete-account')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async deleteAccount(@Req() req: any, @Body() dto: DeleteAccountDto) {
    return this.authService.deleteAccount(req.user.authId, dto);
  }

  // Get authenticated user/owner profile
  @Get('get-me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMe(@Req() req: any) {
    return this.authService.getMe(req.user.authId);
  }

  // Request phone number change — sends OTP to new number
  @Post('request-phone-change')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async requestPhoneChange(
    @Req() req: any,
    @Body() body: { newPhone: string },
  ) {
    if (!body.newPhone) {
      throw new Error('newPhone is required');
    }
    return this.authService.requestPhoneChange(req.user.authId, body.newPhone);
  }

  // Verify phone change OTP — updates phone in DB
  @Post('verify-phone-change')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async verifyPhoneChange(
    @Req() req: any,
    @Body() body: { sessionToken: string; newPhone: string; otp: string },
  ) {
    return this.authService.verifyPhoneChange(
      req.user.authId,
      body.sessionToken,
      body.newPhone,
      body.otp,
    );
  }
}
