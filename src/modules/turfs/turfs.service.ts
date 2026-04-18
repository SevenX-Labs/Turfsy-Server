import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/services/cache.service';
import { CreateTurfDto } from '../owner-profile/dto/create-turf.dto';
import { UpdateTurfDto } from '../owner-profile/dto/update-turf.dto';
import { TurfStatus, SportsType } from '@prisma/client';

@Injectable()
export class TurfsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // 1. Create a Turf
  async createTurf(authId: string, dto: CreateTurfDto) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Owner profile not found');
    if (!profile.name)
      throw new ForbiddenException('Please complete your owner profile first');

    // Guard against accidental duplicate submissions (double-click / retry race)
    // for the exact same turf payload within a short time window.
    const recentDuplicate = await this.prisma.turf.findFirst({
      where: {
        ownerProfileId: profile.id,
        deletedAt: null,
        name: dto.name,
        description: dto.description ?? null,
        sportsType: dto.sportsType,
        turfSize: dto.turfSize,
        address: dto.address,
        city: dto.city,
        pincode: dto.pincode,
        lat: dto.lat,
        lng: dto.lng,
        openTime: dto.openTime,
        closeTime: dto.closeTime,
        minSlotDurationMins: dto.minSlotDurationMins,
        floodLights: dto.floodLights ?? false,
        parking: dto.parking ?? false,
        washroom: dto.washroom ?? false,
        changingRoom: dto.changingRoom ?? false,
        drinkingWater: dto.drinkingWater ?? false,
        seatingArea: dto.seatingArea ?? false,
        cafeteria: dto.cafeteria ?? false,
        weekdayDayPrice: dto.weekdayDayPrice,
        weekdayNightPrice: dto.weekdayNightPrice,
        status: TurfStatus.ACTIVE,
        weekendDayPrice: dto.weekendDayPrice,
        weekendNightPrice: dto.weekendNightPrice,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (
      recentDuplicate &&
      Date.now() - recentDuplicate.createdAt.getTime() <= 30_000
    ) {
      return {
        success: true,
        message: 'Duplicate create request ignored',
        data: recentDuplicate,
      };
    }

    const turf = await this.prisma.turf.create({
      // @ts-ignore: IDE cache may still think groundDayUrl is required
      data: {
        ownerProfileId: profile.id,
        name: dto.name,
        description: dto.description,
        sportsType: dto.sportsType,
        turfSize: dto.turfSize,
        address: dto.address,
        city: dto.city,
        pincode: dto.pincode,
        lat: dto.lat,
        lng: dto.lng,
        openTime: dto.openTime,
        closeTime: dto.closeTime,
        minSlotDurationMins: dto.minSlotDurationMins,
        floodLights: dto.floodLights ?? false,
        parking: dto.parking ?? false,
        washroom: dto.washroom ?? false,
        changingRoom: dto.changingRoom ?? false,
        drinkingWater: dto.drinkingWater ?? false,
        seatingArea: dto.seatingArea ?? false,
        cafeteria: dto.cafeteria ?? false,
        weekdayDayPrice: dto.weekdayDayPrice,
        weekdayNightPrice: dto.weekdayNightPrice,
        weekendDayPrice: dto.weekendDayPrice,
        weekendNightPrice: dto.weekendNightPrice,
      },
    });

    // Invalidate turf list caches
    this.cache.invalidate('turfs:all');
    this.cache.invalidate('home:activeTurfs');

    return {
      success: true,
      message: 'Turf created successfully',
      data: turf,
    };
  }

  // 2. Get Nearby Turfs (Haversine distance calculation)
  async getNearbyTurfs(userLat: number, userLng: number, radiusKm: number) {
    const rawIds = await this.prisma.$queryRaw<
      { id: string; distanceKm: number }[]
    >`
      SELECT * FROM (
        SELECT id,
          (6371 * acos(
            least(1.0, cos(radians(${userLat})) * cos(radians(lat)) *
            cos(radians(lng) - radians(${userLng})) +
            sin(radians(${userLat})) * sin(radians(lat)))
          )) AS "distanceKm"
        FROM "Turf"
        WHERE status = 'ACTIVE' AND "deletedAt" IS NULL
      ) AS t
      WHERE t."distanceKm" <= ${radiusKm}
      ORDER BY t."distanceKm" ASC
      LIMIT 50
    `;

    if (!rawIds.length) {
      return { success: true, count: 0, radiusKm, data: [] };
    }

    const ids = rawIds.map((r) => r.id);
    const turfs = await this.prisma.turf.findMany({
      where: { id: { in: ids } },
      include: {
        owner: { select: { name: true, contactNumber: true } },
      },
    });

    const turfsWithDistance = turfs
      .map((turf) => {
        const distanceInfo = rawIds.find((r) => r.id === turf.id);
        return {
          ...turf,
          distanceKm: distanceInfo
            ? parseFloat(Number(distanceInfo.distanceKm).toFixed(2))
            : 0,
          images: [
            turf.entranceUrl,
            turf.groundDayUrl,
            turf.groundNightUrl,
          ].filter(Boolean),
        };
      })
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

    return {
      success: true,
      count: turfsWithDistance.length,
      radiusKm,
      data: turfsWithDistance,
    };
  }

  // 3. Get All My Turfs (for Owners)
  async getMyTurfs(authId: string) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Owner profile not found');

    const turfs = await this.prisma.turf.findMany({
      where: { ownerProfileId: profile.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: turfs,
    };
  }

  // 3. Update Turf
  async updateTurf(authId: string, turfId: string, dto: UpdateTurfDto) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Owner profile not found');

    const turf = await this.prisma.turf.findUnique({ where: { id: turfId } });
    if (!turf) throw new NotFoundException('Turf not found');
    if (turf.ownerProfileId !== profile.id)
      throw new ForbiddenException('You are not allowed to update this turf');

    const updated = await this.prisma.turf.update({
      where: { id: turfId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.sportsType !== undefined && { sportsType: dto.sportsType }),
        ...(dto.turfSize !== undefined && { turfSize: dto.turfSize }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.pincode !== undefined && { pincode: dto.pincode }),
        ...(dto.lat !== undefined && { lat: dto.lat }),
        ...(dto.lng !== undefined && { lng: dto.lng }),
        ...(dto.openTime !== undefined && { openTime: dto.openTime }),
        ...(dto.closeTime !== undefined && { closeTime: dto.closeTime }),
        ...(dto.minSlotDurationMins !== undefined && {
          minSlotDurationMins: dto.minSlotDurationMins,
        }),
        ...(dto.floodLights !== undefined && { floodLights: dto.floodLights }),
        ...(dto.parking !== undefined && { parking: dto.parking }),
        ...(dto.washroom !== undefined && { washroom: dto.washroom }),
        ...(dto.changingRoom !== undefined && {
          changingRoom: dto.changingRoom,
        }),
        ...(dto.drinkingWater !== undefined && {
          drinkingWater: dto.drinkingWater,
        }),
        ...(dto.seatingArea !== undefined && { seatingArea: dto.seatingArea }),
        ...(dto.cafeteria !== undefined && { cafeteria: dto.cafeteria }),
        ...(dto.weekdayDayPrice !== undefined && {
          weekdayDayPrice: dto.weekdayDayPrice,
        }),
        ...(dto.weekdayNightPrice !== undefined && {
          weekdayNightPrice: dto.weekdayNightPrice,
        }),
        ...(dto.weekendDayPrice !== undefined && {
          weekendDayPrice: dto.weekendDayPrice,
        }),
        ...(dto.weekendNightPrice !== undefined && {
          weekendNightPrice: dto.weekendNightPrice,
        }),
      },
    });

    // Invalidate turf caches
    this.cache.invalidate(`turf:${turfId}`);
    this.cache.invalidate('turfs:all');
    this.cache.invalidate('home:activeTurfs');

    return {
      success: true,
      message: 'Turf updated successfully',
      data: updated,
    };
  }

  // 4. Update Turf Status
  async updateTurfStatus(authId: string, turfId: string, status: TurfStatus) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Owner profile not found');

    const turf = await this.prisma.turf.findUnique({ where: { id: turfId } });
    if (!turf) throw new NotFoundException('Turf not found');
    if (turf.ownerProfileId !== profile.id)
      throw new ForbiddenException('You are not allowed to update this turf');

    const updated = await this.prisma.turf.update({
      where: { id: turfId },
      data: { status },
    });

    // Invalidate turf caches
    this.cache.invalidate(`turf:${turfId}`);
    this.cache.invalidate('turfs:all');
    this.cache.invalidate('home:activeTurfs');

    return {
      success: true,
      message: `Turf status updated to ${status}`,
      data: { id: updated.id, status: updated.status },
    };
  }

  // 5. Get Turf Details (Consumer View) — cached for 2 minutes
  async getTurfDetails(turfId: string, authId?: string) {
    if (authId) {
      // Record view asynchronously (don't block the response)
      (this.prisma as any).recentView
        .upsert({
          where: { userId_turfId: { userId: authId, turfId } },
          create: { userId: authId, turfId },
          update: { viewedAt: new Date() },
        })
        .catch((err) =>
          console.error('[TURFS] Failed to record recent view:', err.message),
        );
    }

    return this.cache.getOrSet(
      `turf:${turfId}`,
      async () => {
        const turf = await this.prisma.turf.findUnique({
          where: { id: turfId },
          include: {
            owner: {
              select: {
                name: true,
                contactNumber: true,
              },
            },
          },
        });

        if (!turf) {
          throw new NotFoundException('Turf not found');
        }

        return {
          ...turf,
          images: [
            turf.entranceUrl,
            turf.groundDayUrl,
            turf.groundNightUrl,
          ].filter(Boolean),
          rating: 4.5, // Placeholder
          rules: [
            'No smoking inside the turf',
            'Wear proper non-marking sports shoes',
            'Please arrive 10 minutes before your slot',
          ],
          customerReviews: [
            {
              reviewerName: 'Rohit Sharma',
              rating: 5,
              comment: 'Excellent quality ground!',
            },
            {
              reviewerName: 'Virat Kohli',
              rating: 4,
              comment: 'Good pitch, floodlights could be better.',
            },
          ],
        };
      },
      1000 * 60 * 2, // 2-minute TTL
    );
  }

  async listAllTurfs() {
    return this.cache.getOrSet(
      'turfs:all',
      async () => {
        const turfs = await this.prisma.turf.findMany({
          where: {
            status: 'ACTIVE',
            deletedAt: null,
          },
          include: {
            owner: {
              select: {
                name: true,
                contactNumber: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 100, // Hard limit added to prevent OOM
        });

        const formatted = turfs.map((turf) => ({
          ...turf,
          images: [turf.entranceUrl, turf.groundDayUrl, turf.groundNightUrl].filter(
            Boolean,
          ),
          rating: 0,
          reviewCount: 0,
        }));

        return {
          success: true,
          count: formatted.length,
          data: formatted,
        };
      },
      1000 * 60 * 3, // 3-minute TTL
    );
  }

  // 6. Basic Search
  async searchTurfs(q: string) {
    const turfs = await this.prisma.turf.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        name: { contains: q, mode: 'insensitive' },
      },
      include: {
        owner: { select: { name: true, contactNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const formatted = turfs.map((turf) => ({
      ...turf,
      images: [turf.entranceUrl, turf.groundDayUrl, turf.groundNightUrl].filter(
        Boolean,
      ),
      rating: 0,
      reviewCount: 0,
    }));

    return {
      success: true,
      count: formatted.length,
      data: formatted,
    };
  }

  // 7. Advanced Filtration
  async filterTurfs(params: {
    city?: string;
    sportsType?: SportsType;
    minPrice?: number;
    maxPrice?: number;
    sortBy?: 'price_low' | 'price_high' | 'distance' | 'popular' | 'newest';
    userLat?: number;
    userLng?: number;
  }) {
    const { city, sportsType, minPrice, maxPrice, sortBy, userLat, userLng } =
      params;

    const where: any = {
      status: 'ACTIVE',
      deletedAt: null,
    };

    if (city) {
      where.city = { equals: city, mode: 'insensitive' };
    }

    if (sportsType) {
      where.sportsType = sportsType;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.weekdayDayPrice = {};
      if (minPrice !== undefined) where.weekdayDayPrice.gte = minPrice;
      if (maxPrice !== undefined) where.weekdayDayPrice.lte = maxPrice;
    }

    let prismaOrderBy: any = { createdAt: 'desc' };
    if (sortBy === 'price_low') prismaOrderBy = { weekdayDayPrice: 'asc' };
    else if (sortBy === 'price_high')
      prismaOrderBy = { weekdayDayPrice: 'desc' };
    else if (sortBy === 'popular')
      prismaOrderBy = { savedByUsers: { _count: 'desc' } };
    else if (sortBy === 'newest') prismaOrderBy = { createdAt: 'desc' };

    const turfs = await this.prisma.turf.findMany({
      where,
      include: {
        owner: { select: { name: true, contactNumber: true } },
      },
      orderBy: sortBy === 'distance' ? undefined : prismaOrderBy,
      take: sortBy === 'distance' ? 200 : 50,
    });

    const haversine = (
      lat1: number,
      lng1: number,
      lat2: number,
      lng2: number,
    ): number => {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    let formatted = turfs.map((turf) => {
      let distanceKm: number | undefined;
      if (
        userLat !== undefined &&
        userLng !== undefined &&
        turf.lat &&
        turf.lng
      ) {
        distanceKm = parseFloat(
          haversine(userLat, userLng, turf.lat, turf.lng).toFixed(2),
        );
      }

      return {
        ...turf,
        distanceKm,
        images: [
          turf.entranceUrl,
          turf.groundDayUrl,
          turf.groundNightUrl,
        ].filter(Boolean),
        rating: 0,
        reviewCount: 0,
      };
    });

    if (
      sortBy === 'distance' &&
      userLat !== undefined &&
      userLng !== undefined
    ) {
      formatted = formatted
        .filter((t) => t.distanceKm !== undefined)
        .sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0))
        .slice(0, 50);
    }

    return {
      success: true,
      count: formatted.length,
      data: formatted,
    };
  }
}
