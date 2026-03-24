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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
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
  @Patch()
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Req() req: any,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.userProfileService.updateProfile(req.user.authId, dto);
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

  // Upload user avatar
  @Patch('upload-avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = './uploads/avatars';
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req: any, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `${req.user?.authId || 'avatar'}-${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return cb(new BadRequestException('Only image files are allowed!'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadAvatar(@Req() req: any, @UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['host'];
    const baseUrl = `${protocol}://${host}`;
    
    const avatarUrl = `${baseUrl}/uploads/avatars/${file.filename}`;
    return this.userProfileService.updateAvatar(req.user.authId, avatarUrl);
  }
}