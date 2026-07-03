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
  Patch,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { CreateMpinDto } from './dto/create-mpin.dto';
import { VerifyMpinDto } from './dto/verify-mpin.dto';
import { ChangeMpinDto } from './dto/change-mpin.dto';
import { ResetMpinDto } from './dto/reset-mpin.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Role } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('api/v3/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ═══════════════════════════════════════════
  //  USER APP ENDPOINTS — role auto-set to USER
  //  Strict rate limiting: 5 req/min for OTP routes
  // ═══════════════════════════════════════════

  @Post('user/login')
  @Throttle({ strict: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to user phone number for login' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid phone number format' })
  async userLogin(
    @Body() dto: LoginDto,
    @Headers('x-forwarded-for') ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.login(dto, ip, userAgent, Role.USER);
  }

  @Post('user/verify-otp')
  @Throttle({ strict: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and return session token for user' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified, session token generated',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP' })
  async userVerifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto, Role.USER);
  }

  @Post('user/resend-otp')
  @Throttle({ strict: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend OTP to user phone' })
  @ApiResponse({ status: 200, description: 'OTP resent successfully' })
  async userResendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  // ═══════════════════════════════════════════
  //  OWNER APP ENDPOINTS — role auto-set to OWNER
  // ═══════════════════════════════════════════

  @Post('owner/login')
  @Throttle({ strict: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to owner phone number for login' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  async ownerLogin(
    @Body() dto: LoginDto,
    @Headers('x-forwarded-for') ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.login(dto, ip, userAgent, Role.OWNER);
  }

  @Post('owner/verify-otp')
  @Throttle({ strict: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and return session token for owner' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified, session token generated',
  })
  async ownerVerifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto, Role.OWNER);
  }

  @Post('owner/resend-otp')
  @Throttle({ strict: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend OTP to owner phone' })
  @ApiResponse({ status: 200, description: 'OTP resent successfully' })
  async ownerResendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  // ═══════════════════════════════════════════
  //  SHARED ENDPOINTS (both apps use these)
  // ═══════════════════════════════════════════

  @Get('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out the current session' })
  @ApiResponse({ status: 200, description: 'Successfully logged out' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(@Req() req: any) {
    return this.authService.logout(req.user.sessionId);
  }

  @Delete('delete-account')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Throttle({ strict: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete current account' })
  @ApiResponse({ status: 200, description: 'Account queued for deletion' })
  async deleteAccount(@Req() req: any, @Body() dto: DeleteAccountDto) {
    return this.authService.deleteAccount(req.user.authId, dto);
  }

  @Get('get-me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current authenticated identity profile' })
  @ApiResponse({
    status: 200,
    description: 'Identity info fetched successfully',
  })
  async getMe(@Req() req: any) {
    return this.authService.getMe(req.user.authId);
  }

  @Post('request-phone-change')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Throttle({ strict: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request phone change and send OTP to new phone number',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        newPhone: { type: 'string', example: '9876543210' },
      },
      required: ['newPhone'],
    },
  })
  @ApiResponse({ status: 200, description: 'OTP sent to new phone' })
  async requestPhoneChange(
    @Req() req: any,
    @Body() body: { newPhone: string },
  ) {
    if (!body.newPhone) {
      throw new Error('newPhone is required');
    }
    return this.authService.requestPhoneChange(req.user.authId, body.newPhone);
  }

  @Post('verify-phone-change')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Throttle({ strict: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and complete phone number change' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sessionToken: { type: 'string' },
        newPhone: { type: 'string', example: '9876543210' },
        otp: { type: 'string', example: '123456' },
      },
      required: ['sessionToken', 'newPhone', 'otp'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Phone number updated successfully',
  })
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

  // ═══════════════════════════════════════════
  //  MPIN ENDPOINTS (authenticated via JWT)
  // ═══════════════════════════════════════════

  @Post('create-mpin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a new MPIN for the authenticated user' })
  @ApiResponse({ status: 200, description: 'MPIN created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid MPIN format' })
  @ApiResponse({ status: 409, description: 'MPIN already exists' })
  async createMpin(@Req() req: any, @Body() dto: CreateMpinDto) {
    return this.authService.createMpin(req.user.authId, dto);
  }

  @Post('verify-mpin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify user MPIN' })
  @ApiResponse({ status: 200, description: 'MPIN verified successfully' })
  @ApiResponse({ status: 400, description: 'MPIN is locked or not set up' })
  @ApiResponse({ status: 401, description: 'Invalid MPIN' })
  async verifyMpin(@Req() req: any, @Body() dto: VerifyMpinDto) {
    return this.authService.verifyMpin(req.user.authId, dto);
  }

  @Patch('change-mpin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change current MPIN' })
  @ApiResponse({ status: 200, description: 'MPIN changed successfully' })
  @ApiResponse({ status: 400, description: 'MPIN is locked or not set up' })
  @ApiResponse({ status: 401, description: 'Invalid current MPIN' })
  async changeMpin(@Req() req: any, @Body() dto: ChangeMpinDto) {
    return this.authService.changeMpin(req.user.authId, dto);
  }

  @Post('reset-mpin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset MPIN after successful OTP verification' })
  @ApiResponse({ status: 200, description: 'MPIN reset successfully' })
  @ApiResponse({
    status: 403,
    description: 'OTP verification is required before resetting MPIN',
  })
  async resetMpin(@Req() req: any, @Body() dto: ResetMpinDto) {
    return this.authService.resetMpin(req.user.authId, dto);
  }
}
