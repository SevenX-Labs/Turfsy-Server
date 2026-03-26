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
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { OwnerProfileService } from './owner-profile.service';
import { CreateOwnerProfileDto } from './dto/create-owner-profile.dto';
import { UpdateOwnerProfileDto } from './dto/update-owner-profile.dto';
import { CreateTurfDto } from './dto/create-turf.dto';
import { UpdateTurfDto } from './dto/update-turf.dto';
import { OwnerPaymentDetailsDto } from './dto/owner-payment-details.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TurfStatus } from '@prisma/client';

// Helper: create multer disk storage for a given folder
function makeStorage(folder: string) {
  return diskStorage({
    destination: (req: any, file, cb) => {
      const uploadPath = `./uploads/${folder}`;
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req: any, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = extname(file.originalname);
      cb(null, `${req.user?.authId || 'owner'}-${uniqueSuffix}${ext}`);
    },
  });
}

const imageFilter = (req: any, file: any, cb: any) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
    return cb(new BadRequestException('Only image files are allowed!'), false);
  }
  cb(null, true);
};

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
  // PATCH /api/v3/ownerProfile/upload-avatar  — Upload avatar separately
  // ─────────────────────────────────────────
  @Patch('upload-avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: makeStorage('avatars/owners'),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: imageFilter,
    }),
  )
  async uploadAvatar(@Req() req: any, @UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Image file is required');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['host'];
    const avatarUrl = `${protocol}://${host}/uploads/avatars/owners/${file.filename}`;
    return this.ownerProfileService.updateAvatar(req.user.authId, avatarUrl);
  }

  // ─────────────────────────────────────────
  // POST /api/v3/ownerProfile/payment-details  — Save UPI
  // ─────────────────────────────────────────
  @Post('payment-details')
  @HttpCode(HttpStatus.OK)
  async savePaymentDetails(@Req() req: any, @Body() dto: OwnerPaymentDetailsDto) {
    return this.ownerProfileService.savePaymentDetails(req.user.authId, dto);
  }
}
