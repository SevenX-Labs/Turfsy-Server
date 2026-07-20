import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UserProfileService } from './user-profile.service';
import { CreateUserProfileDto } from './dto/create-profile.dto';
import { UpdateUserProfileDto } from './dto/update-profile.dto';
import { PaymentDetailsDto } from './dto/payment-details.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('api/v3/user-profile')
@UseGuards(JwtAuthGuard)
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Get()
  async getProfile(@Req() req: any) {
    return this.userProfileService.getProfile(req.user.authId);
  }

  @Get('check-availability')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async checkAvailability(@Query('username') username: string) {
    return this.userProfileService.checkUsernameAvailability(username);
  }

  @Post()
  async createProfile(@Req() req: any, @Body() dto: CreateUserProfileDto) {
    return this.userProfileService.createProfile(req.user.authId, dto);
  }

  // Unified Address Update (Called for both GPS sync and Manual House No. entry)
  @Patch('address')
  @HttpCode(HttpStatus.OK)
  async updateAddress(@Req() req: any, @Body() dto: UpdateUserProfileDto) {
    return this.userProfileService.updateHomeAddress(req.user.authId, dto);
  }

  // General Profile Update
  @Patch()
  @HttpCode(HttpStatus.OK)
  async updateProfile(@Req() req: any, @Body() dto: UpdateUserProfileDto) {
    return this.userProfileService.updateProfile(req.user.authId, dto);
  }

  // Payment Details
  @Post('payment-details')
  async savePaymentDetails(@Req() req: any, @Body() dto: PaymentDetailsDto) {
    return this.userProfileService.savePaymentDetails(req.user.authId, dto);
  }
}
