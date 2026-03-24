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

  // ─────────────────────────────────────────
  // POST /api/v3/ownerProfile/turfs  — Create turf
  // ─────────────────────────────────────────
  @Post('turfs')
  @HttpCode(HttpStatus.CREATED)
  async createTurf(@Req() req: any, @Body() dto: CreateTurfDto) {
    return this.ownerProfileService.createTurf(req.user.authId, dto);
  }

  // ─────────────────────────────────────────
  // GET /api/v3/ownerProfile/turfs  — Get all my turfs
  // ─────────────────────────────────────────
  @Get('turfs')
  @HttpCode(HttpStatus.OK)
  async getMyTurfs(@Req() req: any) {
    return this.ownerProfileService.getMyTurfs(req.user.authId);
  }

  // ─────────────────────────────────────────
  // PATCH /api/v3/ownerProfile/turfs/:turfId  — Update turf
  // ─────────────────────────────────────────
  @Patch('turfs/:turfId')
  @HttpCode(HttpStatus.OK)
  async updateTurf(
    @Req() req: any,
    @Param('turfId') turfId: string,
    @Body() dto: UpdateTurfDto,
  ) {
    return this.ownerProfileService.updateTurf(req.user.authId, turfId, dto);
  }

  // ─────────────────────────────────────────
  // POST /api/v3/ownerProfile/turfs/:turfId/images  — Upload turf images
  // ─────────────────────────────────────────
  @Post('turfs/:turfId/images')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'groundDay', maxCount: 1 },
        { name: 'groundNight', maxCount: 1 },
        { name: 'entrance', maxCount: 1 },
        { name: 'seatingArea', maxCount: 1 },
      ],
      {
        storage: makeStorage('turfs'),
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: imageFilter,
      },
    ),
  )
  async uploadTurfImages(
    @Req() req: any,
    @Param('turfId') turfId: string,
    @UploadedFiles()
    files: {
      groundDay?: any[];
      groundNight?: any[];
      entrance?: any[];
      seatingArea?: any[];
    },
  ) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['host'];
    const base = `${protocol}://${host}/uploads/turfs`;

    const images: Record<string, string> = {};
    if (files.groundDay?.[0]) images.groundDayUrl = `${base}/${files.groundDay[0].filename}`;
    if (files.groundNight?.[0]) images.groundNightUrl = `${base}/${files.groundNight[0].filename}`;
    if (files.entrance?.[0]) images.entranceUrl = `${base}/${files.entrance[0].filename}`;
    if (files.seatingArea?.[0]) images.seatingAreaUrl = `${base}/${files.seatingArea[0].filename}`;

    if (Object.keys(images).length === 0)
      throw new BadRequestException('At least one image is required');

    return this.ownerProfileService.updateTurfImages(req.user.authId, turfId, images);
  }

  // ─────────────────────────────────────────
  // PATCH /api/v3/ownerProfile/turfs/:turfId/status  — Update turf status
  // ─────────────────────────────────────────
  @Patch('turfs/:turfId/status')
  @HttpCode(HttpStatus.OK)
  async updateTurfStatus(
    @Req() req: any,
    @Param('turfId') turfId: string,
    @Body() body: { status: TurfStatus },
  ) {
    if (!body.status) throw new BadRequestException('status is required');
    return this.ownerProfileService.updateTurfStatus(req.user.authId, turfId, body.status);
  }
}
