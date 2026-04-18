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
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import { TurfsService } from './turfs.service';
import { UploadService } from '../upload/upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TurfStatus, SportsType } from '@prisma/client';
import { CreateTurfDto } from '../owner-profile/dto/create-turf.dto';
import { UpdateTurfDto } from '../owner-profile/dto/update-turf.dto';

import { diskStorage } from 'multer';
import { extname } from 'path';
import * as os from 'os';

const tmpDiskStorage = diskStorage({
  destination: os.tmpdir(),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + '-' + uniqueSuffix + extname(file.originalname || ''),
    );
  },
});

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
        storage: tmpDiskStorage,
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
      await this.uploadService.uploadTurfImage(
        req.user.authId,
        turf.id,
        'entrance',
        files.entrance[0],
      );
    }
    if (files?.dayTurf?.[0]) {
      await this.uploadService.uploadTurfImage(
        req.user.authId,
        turf.id,
        'dayTurf',
        files.dayTurf[0],
      );
    }
    if (files?.nightTurf?.[0]) {
      await this.uploadService.uploadTurfImage(
        req.user.authId,
        turf.id,
        'nightTurf',
        files.nightTurf[0],
      );
    }

    // Return the latest turf data with URLs
    return this.turfsService.getTurfDetails(turf.id);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async listTurfs() {
    return this.turfsService.listAllTurfs();
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
    if (
      parsedLat < -90 ||
      parsedLat > 90 ||
      parsedLng < -180 ||
      parsedLng > 180
    ) {
      throw new BadRequestException(
        'Invalid coordinates. Lat must be between -90 and 90, Lng between -180 and 180',
      );
    }

    const radius = radiusKm ? parseFloat(radiusKm) : 10; // default 10 km
    // 3. Rate/Load Protection: Limit radius to prevent querying thousands of locations
    if (radius <= 0 || radius > 100) {
      throw new BadRequestException(
        'Search radius must be between 1 and 100 km',
      );
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

  // 4. Basic Search (Text based)
  @Get('search')
  @HttpCode(HttpStatus.OK)
  async searchTurfs(@Query('q') q: string) {
    if (!q) throw new BadRequestException('Search query "q" is required');
    return this.turfsService.searchTurfs(q);
  }

  // 5. Advanced Filtration & Sorting
  @Get('filter')
  @HttpCode(HttpStatus.OK)
  async filterTurfs(
    @Query('city') city?: string,
    @Query('sportsType') sportsType?: SportsType,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('sortBy')
    sortBy?: 'price_low' | 'price_high' | 'distance' | 'popular' | 'newest',
    @Query('userLat') userLat?: string,
    @Query('userLng') userLng?: string,
  ) {
    let parsedMinPrice: number | undefined;
    let parsedMaxPrice: number | undefined;

    if (minPrice) {
      parsedMinPrice = parseFloat(minPrice);
      if (isNaN(parsedMinPrice))
        throw new BadRequestException('minPrice must be a valid number');
    }

    if (maxPrice) {
      parsedMaxPrice = parseFloat(maxPrice);
      if (isNaN(parsedMaxPrice))
        throw new BadRequestException('maxPrice must be a valid number');
    }

    let parsedLat: number | undefined;
    let parsedLng: number | undefined;

    if (sortBy === 'distance') {
      if (!userLat || !userLng) {
        throw new BadRequestException(
          'userLat and userLng are required when sorting by distance',
        );
      }
      parsedLat = parseFloat(userLat);
      parsedLng = parseFloat(userLng);
      if (isNaN(parsedLat) || isNaN(parsedLng)) {
        throw new BadRequestException(
          'userLat and userLng must be valid numbers',
        );
      }
    } else if (userLat && userLng) {
      // Optional even if not sorting by distance, just to attach distance metric
      parsedLat = parseFloat(userLat);
      parsedLng = parseFloat(userLng);
    }

    return this.turfsService.filterTurfs({
      city,
      sportsType,
      minPrice: parsedMinPrice,
      maxPrice: parsedMaxPrice,
      sortBy: sortBy || 'newest',
      userLat: parsedLat,
      userLng: parsedLng,
    });
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
        storage: tmpDiskStorage,
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
      await this.uploadService.uploadTurfImage(
        req.user.authId,
        turfId,
        'entrance',
        files.entrance[0],
      );
    }
    if (files?.dayTurf?.[0]) {
      await this.uploadService.uploadTurfImage(
        req.user.authId,
        turfId,
        'dayTurf',
        files.dayTurf[0],
      );
    }
    if (files?.nightTurf?.[0]) {
      await this.uploadService.uploadTurfImage(
        req.user.authId,
        turfId,
        'nightTurf',
        files.nightTurf[0],
      );
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
    if (![TurfStatus.ACTIVE, TurfStatus.INACTIVE].includes(body.status)) {
      throw new BadRequestException('status must be ACTIVE or INACTIVE');
    }
    return this.turfsService.updateTurfStatus(
      req.user.authId,
      turfId,
      body.status,
    );
  }

  // 5. Get Turf Details (Consumer View)
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':turfId')
  @HttpCode(HttpStatus.OK)
  async getTurfDetails(@Req() req: any, @Param('turfId') turfId: string) {
    return this.turfsService.getTurfDetails(turfId, req.user?.authId);
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
        storage: tmpDiskStorage,
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
      await this.uploadService.uploadTurfImage(
        req.user.authId,
        turfId,
        'entrance',
        files.entrance[0],
      );
    }
    if (files.dayTurf?.[0]) {
      await this.uploadService.uploadTurfImage(
        req.user.authId,
        turfId,
        'dayTurf',
        files.dayTurf[0],
      );
    }
    if (files.nightTurf?.[0]) {
      await this.uploadService.uploadTurfImage(
        req.user.authId,
        turfId,
        'nightTurf',
        files.nightTurf[0],
      );
    }

    return this.turfsService.getTurfDetails(turfId);
  }

  // 7. Separate Image Upload (Single) - One by One
  @Patch(':turfId/upload-image/:type')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: tmpDiskStorage,
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

    await this.uploadService.uploadTurfImage(
      req.user.authId,
      turfId,
      type,
      file,
    );
    return this.turfsService.getTurfDetails(turfId);
  }

  // 8. Upload/Update Turf Video - Idempotent (overwrites existing)
  @Post(':turfId/video')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: tmpDiskStorage,
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'video/mp4',
          'video/quicktime',
          'video/x-matroska',
          'video/webm',
          'video/x-msvideo',
          'video/avi',
        ];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              'Only mp4, mov, avi, mkv, and webm videos are allowed',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadTurfVideo(
    @Req() req: any,
    @Param('turfId') turfId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Video file is required');

    await this.uploadService.uploadTurfVideo(req.user.authId, turfId, file);
    return this.turfsService.getTurfDetails(turfId);
  }

  // 9. Update Turf Video (alias route) - behaves same as upload, overwrites existing
  @Patch(':turfId/video')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: tmpDiskStorage,
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'video/mp4',
          'video/quicktime',
          'video/x-matroska',
          'video/webm',
          'video/x-msvideo',
          'video/avi',
        ];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException(
              'Only mp4, mov, avi, mkv, and webm videos are allowed',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async updateTurfVideo(
    @Req() req: any,
    @Param('turfId') turfId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Video file is required');

    await this.uploadService.uploadTurfVideo(req.user.authId, turfId, file);
    return this.turfsService.getTurfDetails(turfId);
  }
}
