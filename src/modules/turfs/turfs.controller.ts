import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { TurfsService } from './turfs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TurfStatus } from '@prisma/client';
import { CreateTurfDto } from '../owner-profile/dto/create-turf.dto';
import { UpdateTurfDto } from '../owner-profile/dto/update-turf.dto';

// Helper for multer disk storage
function makeStorage() {
  return diskStorage({
    destination: (req: any, file, cb) => {
      const turfId = req.params.turfId || 'new';
      const uploadPath = `./uploads/turfs/${turfId}`;
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req: any, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = extname(file.originalname);
      // Clean original filename (no spaces or weird characters)
      const cleanName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '').slice(0, 20);
      cb(null, `${uniqueSuffix}-${cleanName}`);
    },
  });
}

const imageFilter = (req: any, file: any, cb: any) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
    return cb(new BadRequestException('Only image files are allowed!'), false);
  }
  cb(null, true);
};

@Controller('api/v3/turfs')
export class TurfsController {
  constructor(private readonly turfsService: TurfsService) {}

  // 1. Create a Turf
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createTurf(@Req() req: any, @Body() dto: CreateTurfDto) {
    return this.turfsService.createTurf(req.user.authId, dto);
  }

  // 2. Search Nearby Turfs (by current location or manual map pin)
  // GET /api/v3/turfs/nearby?lat=19.07&lng=72.87&radiusKm=10
  @Get('nearby')
  @HttpCode(HttpStatus.OK)
  async getNearbyTurfs(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radiusKm') radiusKm?: string,
  ) {
    if (!lat || !lng) {
      throw new BadRequestException('lat and lng query params are required');
    }
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      throw new BadRequestException('lat and lng must be valid numbers');
    }
    const radius = radiusKm ? parseFloat(radiusKm) : 10; // default 10 km
    return this.turfsService.getNearbyTurfs(parsedLat, parsedLng, radius);
  }

  // 3. Get All My Turfs (for Owners)
  @Get('my')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMyTurfs(@Req() req: any) {
    return this.turfsService.getMyTurfs(req.user.authId);
  }

  // 3. Update Turf (lat and lng are omitted to prevent constant changes)
  @Patch(':turfId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateTurf(
    @Req() req: any,
    @Param('turfId') turfId: string,
    @Body() dto: UpdateTurfDto,
  ) {
    return this.turfsService.updateTurf(req.user.authId, turfId, dto);
  }

  // 4. Update Turf Status
  @Patch(':turfId/status')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateTurfStatus(
    @Req() req: any,
    @Param('turfId') turfId: string,
    @Body() body: { status: TurfStatus },
  ) {
    if (!body.status) throw new BadRequestException('status is required');
    return this.turfsService.updateTurfStatus(req.user.authId, turfId, body.status);
  }

  // 5. Get Turf Details (Consumer View)
  @Get(':turfId')
  @HttpCode(HttpStatus.OK)
  async getTurfDetails(@Param('turfId') turfId: string) {
    return this.turfsService.getTurfDetails(turfId);
  }

  // 6. Upload 3 images (entrance, day turf, night turf)
  @Post(':turfId/images')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'entrance', maxCount: 1 },
        { name: 'dayTurf', maxCount: 1 },
        { name: 'nightTurf', maxCount: 1 },
      ],
      {
        storage: makeStorage(),
        limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max size
        fileFilter: imageFilter,
      },
    ),
  )
  async uploadTurfImages(
    @Param('turfId') turfId: string,
    @UploadedFiles()
    files: {
      entrance?: any[];
      dayTurf?: any[];
      nightTurf?: any[];
    },
    @Req() req: any,
  ) {
    if (!files.entrance && !files.dayTurf && !files.nightTurf) {
      throw new BadRequestException('At least one image must be provided');
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['host'];
    const base = `${protocol}://${host}/uploads/turfs/${turfId}`;

    const images: any = {};
    if (files.entrance?.[0]) images.entranceUrl = `${base}/${files.entrance[0].filename}`;
    if (files.dayTurf?.[0]) images.groundDayUrl = `${base}/${files.dayTurf[0].filename}`;
    if (files.nightTurf?.[0]) images.groundNightUrl = `${base}/${files.nightTurf[0].filename}`;

    return this.turfsService.updateTurfImagesWithIdempotency(req.user.authId, turfId, images);
  }
}
