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
  Param,
  Delete,
} from '@nestjs/common';
import { UserProfileService } from './user-profile.service';
import { CreateUserProfileDto } from './dto/create-profile.dto';
import { UpdateUserProfileDto } from './dto/update-profile.dto';
import { CreateUserAddressDto } from './dto/create-address.dto';
import { PaymentDetailsDto } from './dto/payment-details.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v3/user-profile')
@UseGuards(JwtAuthGuard)
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Get()
  async getProfile(@Req() req: any) {
    return this.userProfileService.getProfile(req.user.authId);
  }

  @Post()
  async createProfile(@Req() req: any, @Body() dto: CreateUserProfileDto) {
    return this.userProfileService.createProfile(req.user.authId, dto);
  }

  // Route 1: Update Home Address (Detailed Profile Address)
  @Patch('home-address')
  @HttpCode(HttpStatus.OK)
  async updateHomeAddress(@Req() req: any, @Body() dto: UpdateUserProfileDto) {
    return this.userProfileService.updateHomeAddress(req.user.authId, dto);
  }

  // Route 2: Add New Location (Address List)
  @Post('add-new-location')
  @HttpCode(HttpStatus.CREATED)
  async addNewLocation(@Req() req: any, @Body() dto: CreateUserAddressDto) {
    return this.userProfileService.addNewLocation(req.user.authId, dto);
  }

  // Management Routes
  @Get('addresses')
  async getAddresses(@Req() req: any) {
    return this.userProfileService.getAddresses(req.user.authId);
  }

  @Delete('address/:id')
  async deleteAddress(@Req() req: any, @Param('id') id: string) {
    return this.userProfileService.deleteAddress(req.user.authId, id);
  }

  @Post('payment-details')
  async savePaymentDetails(@Req() req: any, @Body() dto: PaymentDetailsDto) {
    return this.userProfileService.savePaymentDetails(req.user.authId, dto);
  }
}