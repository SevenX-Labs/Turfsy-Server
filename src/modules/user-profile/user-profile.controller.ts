import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UserProfileService } from './user-profile.service';
import { CreateUserProfileDto } from './dto/create-profile.dto';
import { UpdateUserProfileDto } from './dto/update-profile.dto';
import { PaymentDetailsDto } from './dto/payment-details.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v3/user-profile')
@UseGuards(JwtAuthGuard)
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  // Create profile after first login (role = USER)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProfile(@Req() req: any, @Body() dto: CreateUserProfileDto) {
    return this.userProfileService.createProfile(req.user.authId, dto);
  }

  // Get own profile with payment
  @Get()
  @HttpCode(HttpStatus.OK)
  async getProfile(@Req() req: any) {
    return this.userProfileService.getProfile(req.user.authId);
  }

  // Update profile fields
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.userProfileService.updateProfile(req.user.authId, id, dto);
  }

  // Save UPI payment details
  @Post('payment-details')
  @HttpCode(HttpStatus.OK)
  async savePaymentDetails(@Req() req: any, @Body() dto: PaymentDetailsDto) {
    return this.userProfileService.savePaymentDetails(req.user.authId, dto);
  }

  // Update location from expo-location
  @Post('location')
  @HttpCode(HttpStatus.OK)
  async updateLocation(
    @Req() req: any,
    @Body() body: { lat: number; lng: number; city?: string },
  ) {
    return this.userProfileService.updateLocation(
      req.user.authId,
      body.lat,
      body.lng,
      body.city,
    );
  }
}