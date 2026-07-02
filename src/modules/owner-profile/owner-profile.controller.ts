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
} from '@nestjs/common';
import { OwnerProfileService } from './owner-profile.service';
import { CreateOwnerProfileDto } from './dto/create-owner-profile.dto';
import { UpdateOwnerProfileDto } from './dto/update-owner-profile.dto';
import { OwnerPaymentDetailsDto } from './dto/owner-payment-details.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Owners')
@ApiBearerAuth('JWT-auth')
@Controller('api/v3/ownerProfile')
@UseGuards(JwtAuthGuard)
export class OwnerProfileController {
  constructor(private readonly ownerProfileService: OwnerProfileService) {}

  // ─────────────────────────────────────────
  // POST /api/v3/ownerProfile  — Create owner profile
  // ─────────────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProfile(@Req() req: any, @Body() dto: CreateOwnerProfileDto) {
    return this.ownerProfileService.createProfile(req.user.authId, dto);
  }

  // ─────────────────────────────────────────
  // GET /api/v3/ownerProfile  — Get own profile
  // ─────────────────────────────────────────
  @Get()
  @HttpCode(HttpStatus.OK)
  async getProfile(@Req() req: any) {
    return this.ownerProfileService.getProfile(req.user.authId);
  }

  // ─────────────────────────────────────────
  // PATCH /api/v3/ownerProfile  — Update owner profile
  // ─────────────────────────────────────────
  @Patch()
  @HttpCode(HttpStatus.OK)
  async updateProfile(@Req() req: any, @Body() dto: UpdateOwnerProfileDto) {
    return this.ownerProfileService.updateProfile(req.user.authId, dto);
  }

  // ─────────────────────────────────────────
  // POST /api/v3/ownerProfile/payment-details  — Save UPI
  // ─────────────────────────────────────────
  @Post('payment-details')
  @HttpCode(HttpStatus.OK)
  async savePaymentDetails(
    @Req() req: any,
    @Body() dto: OwnerPaymentDetailsDto,
  ) {
    return this.ownerProfileService.savePaymentDetails(req.user.authId, dto);
  }
}
