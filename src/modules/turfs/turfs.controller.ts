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
  UploadedFile,
  BadRequestException,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { TurfsService } from './turfs.service';
import { UploadService } from '../upload/upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TurfStatus } from '@prisma/client';
import { CreateTurfDto } from '../owner-profile/dto/create-turf.dto';
import { UpdateTurfDto } from '../owner-profile/dto/update-turf.dto';

import { memoryStorage } from 'multer';

@Controller('api/v3/turfs')
export class TurfsController {
  constructor(
    private readonly turfsService: TurfsService,
    private readonly uploadService: UploadService,
  ) {}

  // 1. Create a Turf
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'entrance', maxCount: 1 },
        { name: 'dayTurf', maxCount: 1 },
        { name: 'nightTurf', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 5 * 1024 * 1024 },
      },
    ),
  )
  async createTurf(
    @Req() req: any,
    @Body() dto: CreateTurfDto,
    @UploadedFiles()
    files: {
      entrance?: any[];
      dayTurf?: any[];
      nightTurf?: any[];
    },
  ) {
    const response = await this.turfsService.createTurf(req.user.authId, dto);
    const turf = response.data;

    // Handle initial image uploads if provided
    if (files?.entrance?.[0]) {
      await this.uploadService.uploadTurfImage(req.user.authId, turf.id, 'entrance', files.entrance[0]);
    }
    if (files?.dayTurf?.[0]) {
      await this.uploadService.uploadTurfImage(req.user.authId, turf.id, 'dayTurf', files.dayTurf[0]);
    }
    if (files?.nightTurf?.[0]) {
      await this.uploadService.uploadTurfImage(req.user.authId, turf.id, 'nightTurf', files.nightTurf[0]);
    }

    // Return the latest turf data with URLs
    return this.turfsService.getTurfDetails(turf.id);
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
    // 2. Coordinate Validation: Prevent impossible math or DB errors
    if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
      throw new BadRequestException('Invalid coordinates. Lat must be between -90 and 90, Lng between -180 and 180');
    }

    const radius = radiusKm ? parseFloat(radiusKm) : 10; // default 10 km
    // 3. Rate/Load Protection: Limit radius to prevent querying thousands of locations
    if (radius <= 0 || radius > 100) {
      throw new BadRequestException('Search radius must be between 1 and 100 km');
    }

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
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'entrance', maxCount: 1 },
        { name: 'dayTurf', maxCount: 1 },
        { name: 'nightTurf', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 5 * 1024 * 1024 },
      },
    ),
  )
  async updateTurf(
    @Req() req: any,
    @Param('turfId') turfId: string,
    @Body() dto: UpdateTurfDto,
    @UploadedFiles()
    files: {
      entrance?: any[];
      dayTurf?: any[];
      nightTurf?: any[];
    },
  ) {
    // 1. Update metadata
    await this.turfsService.updateTurf(req.user.authId, turfId, dto);

    // 2. Update images if provided
    if (files?.entrance?.[0]) {
      await this.uploadService.uploadTurfImage(req.user.authId, turfId, 'entrance', files.entrance[0]);
    }
    if (files?.dayTurf?.[0]) {
      await this.uploadService.uploadTurfImage(req.user.authId, turfId, 'dayTurf', files.dayTurf[0]);
    }
    if (files?.nightTurf?.[0]) {
      await this.uploadService.uploadTurfImage(req.user.authId, turfId, 'nightTurf', files.nightTurf[0]);
    }

    // 3. Return latest details
    return this.turfsService.getTurfDetails(turfId);
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

  // 6. Upload 3 images (entrance, day turf, night turf) - Idempotent
  @Post(':turfId/images')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'entrance', maxCount: 1 },
        { name: 'dayTurf', maxCount: 1 },
        { name: 'nightTurf', maxCount: 1 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 5 * 1024 * 1024 },
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
    if (!files || (!files.entrance && !files.dayTurf && !files.nightTurf)) {
      throw new BadRequestException('At least one image must be provided');
    }

    if (files?.entrance?.[0]) {
      await this.uploadService.uploadTurfImage(req.user.authId, turfId, 'entrance', files.entrance[0]);
    }
    if (files.dayTurf?.[0]) {
      await this.uploadService.uploadTurfImage(req.user.authId, turfId, 'dayTurf', files.dayTurf[0]);
    }
    if (files.nightTurf?.[0]) {
      await this.uploadService.uploadTurfImage(req.user.authId, turfId, 'nightTurf', files.nightTurf[0]);
    }

    return this.turfsService.getTurfDetails(turfId);
  }

  // 7. Separate Image Upload (Single) - One by One
  @Patch(':turfId/upload-image/:type')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadSingleTurfImage(
    @Req() req: any,
    @Param('turfId') turfId: string,
    @Param('type') type: 'entrance' | 'dayTurf' | 'nightTurf',
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Image file is required');
    if (!['entrance', 'dayTurf', 'nightTurf'].includes(type)) {
      throw new BadRequestException('Invalid image type');
    }

    await this.uploadService.uploadTurfImage(req.user.authId, turfId, type, file);
    return this.turfsService.getTurfDetails(turfId);
  }
}
