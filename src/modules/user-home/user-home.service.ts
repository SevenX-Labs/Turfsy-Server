// Updated: Using 'city' field instead of 'currentCity'
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SportsType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HomeSectionType } from './types/home-section.enum';
import { TurfCardDto } from './dto/turf-card.dto';
import { UserHomeSectionDto } from './dto/user-home-section.dto';
import { UserHomeResponseDto } from './dto/user-home-response.dto';
import { UserHomeSectionResponseDto } from './dto/user-home-section-response.dto';

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────

const SECTION_LIMIT = 10; // max turfs per section
const DEFAULT_RADIUS_KM = 5; // nearby radius default when GPS provided
const MIN_RADIUS_KM = 1;
const MAX_RADIUS_KM = 15;
const BUDGET_MAX_PRICE = 800; // weekdayDayPrice <= this = budget friendly
const MIN_RATING_THRESHOLD = 3.5; // used for top recommended
const HIGH_DEMAND_BOOKING_THRESHOLD = 5; // placeholder — can wire to bookings later
const NEW_TURF_DAYS = 30; // newly opened = created within last N days

export type UserHomeQueryOptions = {
  authId?: string;
  queryLat?: number;
  queryLng?: number;
  queryCity?: string;
  queryRadiusKm?: number;
};

type LocationContext = {
  userLat?: number;
  userLng?: number;
  userCity: string | null;
  radiusKm: number;
  preferredSport: SportsType | null;
};

// ─────────────────────────────────────────
// Haversine distance helper (pure function)
// ─────────────────────────────────────────

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth radius km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100; // round to 2 decimals
}

// ─────────────────────────────────────────
// Raw turf shape from Prisma (partial select)
// ─────────────────────────────────────────

type RawTurf = {
  id: string;
  name: string;
  city: string;
  address: string;
  sportsType: string;
  turfSize: string;
  status: string;
  openTime: string;
  closeTime: string;
  lat: number;
  lng: number;
  weekdayDayPrice: number;
  weekdayNightPrice: number;
  weekendDayPrice: number;
  weekendNightPrice: number;
  floodLights: boolean;
  parking: boolean;
  washroom: boolean;
  changingRoom: boolean;
  drinkingWater: boolean;
  seatingArea: boolean;
  cafeteria: boolean;
  groundDayUrl: string | null;
  groundNightUrl: string | null;
  entranceUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner: {
    name: string;
    contactNumber: string;
  };
  _avg?: { rating: number | null } | null;
  _count?: { reviews: number } | null;
};

@Injectable()
export class UserHomeService {
  private readonly logger = new Logger(UserHomeService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────
  // Main entry point
  // ─────────────────────────────────────────

  async getHomeSections(
    options: UserHomeQueryOptions = {},
  ): Promise<UserHomeResponseDto> {
    try {
      const location = await this.resolveLocation(options);
      // Fetch all active turfs once with aggregates
      const allTurfs = await this.fetchAllActiveTurfs();
      const scopedTurfs = this.filterByPreferredSport(
        allTurfs,
        location.preferredSport,
      );

      // Build each section in parallel for performance
      const [
        topRecommended,
        mostRated,
        budgetFriendly,
        nearby,
        mostDemanded,
        newlyOpened,
        recentlyViewed,
      ] = await Promise.all([
        this.buildTopRecommended(
          scopedTurfs,
          location.userLat,
          location.userLng,
          location.preferredSport,
        ),
        this.buildMostRated(
          scopedTurfs,
          location.userLat,
          location.userLng,
          location.preferredSport,
        ),
        this.buildBudgetFriendly(
          scopedTurfs,
          location.userLat,
          location.userLng,
          location.preferredSport,
        ),
        this.buildNearby(
          scopedTurfs,
          location.userLat,
          location.userLng,
          location.radiusKm,
          location.userCity ?? undefined,
          location.preferredSport,
        ),
        this.buildMostDemanded(
          scopedTurfs,
          location.userLat,
          location.userLng,
          location.preferredSport,
        ),
        this.buildNewlyOpened(
          scopedTurfs,
          location.userLat,
          location.userLng,
          location.preferredSport,
        ),
        this.buildRecentlyViewed(
          scopedTurfs,
          location.userLat,
          location.userLng,
          location.preferredSport,
        ),
      ]);

      const sections: UserHomeSectionDto[] = [
        topRecommended,
        mostRated,
        budgetFriendly,
        nearby,
        mostDemanded,
        newlyOpened,
        recentlyViewed,
      ].filter((s) => s.turfs.length > 0);

      return {
        success: true,
        userCity: location.userCity,
        sections,
      };
    } catch (error) {
      this.logger.error(
        'Failed to build home sections',
        error instanceof Error ? error.stack : error,
      );
      throw new InternalServerErrorException(
        'Failed to load home data. Please try again.',
      );
    }
  }

  async getSection(
    sectionType: HomeSectionType,
    options: UserHomeQueryOptions = {},
  ): Promise<UserHomeSectionResponseDto> {
    const location = await this.resolveLocation(options);
    const allTurfs = await this.fetchAllActiveTurfs();
    const scopedTurfs = this.filterByPreferredSport(
      allTurfs,
      location.preferredSport,
    );

    let section: UserHomeSectionDto;
    switch (sectionType) {
      case HomeSectionType.TOP_RECOMMENDED:
        section = this.buildTopRecommended(
          scopedTurfs,
          location.userLat,
          location.userLng,
          location.preferredSport,
        );
        break;
      case HomeSectionType.MOST_RATED:
        section = this.buildMostRated(
          scopedTurfs,
          location.userLat,
          location.userLng,
          location.preferredSport,
        );
        break;
      case HomeSectionType.BUDGET_FRIENDLY:
        section = this.buildBudgetFriendly(
          scopedTurfs,
          location.userLat,
          location.userLng,
          location.preferredSport,
        );
        break;
      case HomeSectionType.NEARBY:
        section = this.buildNearby(
          scopedTurfs,
          location.userLat,
          location.userLng,
          location.radiusKm,
          location.userCity,
          location.preferredSport,
        );
        break;
      case HomeSectionType.MOST_DEMANDED:
        section = this.buildMostDemanded(
          scopedTurfs,
          location.userLat,
          location.userLng,
          location.preferredSport,
        );
        break;
      case HomeSectionType.NEWLY_OPENED:
        section = this.buildNewlyOpened(
          scopedTurfs,
          location.userLat,
          location.userLng,
          location.preferredSport,
        );
        break;
      case HomeSectionType.RECENTLY_VIEWED:
        section = this.buildRecentlyViewed(
          scopedTurfs,
          location.userLat,
          location.userLng,
          location.preferredSport,
        );
        break;
      default:
        section = {
          sectionType,
          title: 'Section',
          subtitle: undefined,
          turfs: [],
        };
    }

    return {
      success: true,
      userCity: location.userCity,
      section,
    };
  }

  // ─────────────────────────────────────────
  // Prisma fetch — all active turfs once
  // ─────────────────────────────────────────

  private async fetchAllActiveTurfs(): Promise<RawTurf[]> {
    // NOTE: If your schema has a Review model linked to Turf,
    // add `_avg: { select: { rating: true } }` and `_count: { select: { reviews: true } }`.
    // For now, this safely falls back to 0 if those relations don't exist yet.
    const turfs = await (this.prisma as any).turf.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        sportsType: true,
        turfSize: true,
        status: true,
        openTime: true,
        closeTime: true,
        lat: true,
        lng: true,
        weekdayDayPrice: true,
        weekdayNightPrice: true,
        weekendDayPrice: true,
        weekendNightPrice: true,
        floodLights: true,
        parking: true,
        washroom: true,
        changingRoom: true,
        drinkingWater: true,
        seatingArea: true,
        cafeteria: true,
        groundDayUrl: true,
        groundNightUrl: true,
        entranceUrl: true,
        updatedAt: true,
        createdAt: true,
        owner: {
          select: {
            name: true,
            contactNumber: true,
          },
        },
      },
    });

    return turfs as RawTurf[];
  }

  // ─────────────────────────────────────────
  // Map raw turf → TurfCardDto
  // ─────────────────────────────────────────

  private toCard(turf: RawTurf, distanceKm: number | null = null): TurfCardDto {
    const images: string[] = [];
    if (turf.entranceUrl) images.push(turf.entranceUrl);
    if (turf.groundDayUrl) images.push(turf.groundDayUrl);
    if (turf.groundNightUrl) images.push(turf.groundNightUrl);

    const rating =
      typeof turf._avg?.rating === 'number'
        ? Math.round(turf._avg.rating * 10) / 10
        : 0;

    const reviewCount = turf._count?.reviews ?? 0;

    return {
      id: turf.id,
      name: turf.name,
      city: turf.city,
      address: turf.address,
      distanceKm,
      rating,
      reviewCount,
      sportsType: turf.sportsType,
      turfSize: turf.turfSize,
      status: turf.status,
      openTime: turf.openTime,
      closeTime: turf.closeTime,
      weekdayDayPrice: turf.weekdayDayPrice,
      weekdayNightPrice: turf.weekdayNightPrice,
      weekendDayPrice: turf.weekendDayPrice,
      weekendNightPrice: turf.weekendNightPrice,
      floodLights: turf.floodLights,
      parking: turf.parking,
      washroom: turf.washroom,
      changingRoom: turf.changingRoom,
      drinkingWater: turf.drinkingWater,
      seatingArea: turf.seatingArea,
      cafeteria: turf.cafeteria,
      images,
      owner: {
        name: turf.owner?.name ?? '',
        contactNumber: turf.owner?.contactNumber ?? '',
      },
      createdAt: turf.createdAt,
    };
  }

  // ─────────────────────────────────────────
  // Distance helper — returns km or null
  // ─────────────────────────────────────────

  private getDistance(
    turf: RawTurf,
    userLat?: number,
    userLng?: number,
  ): number | null {
    if (
      userLat == null ||
      userLng == null ||
      turf.lat == null ||
      turf.lng == null
    )
      return null;
    return haversineKm(userLat, userLng, turf.lat, turf.lng);
  }

  private prioritizeByPreferredSport<T extends { sportsType: string }>(
    items: T[],
    preferredSport: SportsType | null,
  ): T[] {
    if (!preferredSport) return items;
    return [...items].sort((a, b) => {
      const aPreferred = a.sportsType === preferredSport ? 1 : 0;
      const bPreferred = b.sportsType === preferredSport ? 1 : 0;
      return bPreferred - aPreferred;
    });
  }

  private filterByPreferredSport(
    turfs: RawTurf[],
    preferredSport: SportsType | null,
  ): RawTurf[] {
    if (!preferredSport) return turfs;
    const filtered = turfs.filter((t) => t.sportsType === preferredSport);
    return filtered.length > 0 ? filtered : turfs;
  }

  private async resolveLocation(
    options: UserHomeQueryOptions,
  ): Promise<LocationContext> {
    const trimmedCity = options.queryCity?.trim();
    const cleanCity =
      trimmedCity && trimmedCity.length > 0 ? trimmedCity : undefined;
    const hasValidCoordinates =
      this.isValidLatitude(options.queryLat) &&
      this.isValidLongitude(options.queryLng);

    let profileLocation: {
      currentLat: number | null;
      currentLng: number | null;
      city: string | null;
    } | null = null;
    let preferredSport: SportsType | null = null;

    if (options.authId && (!hasValidCoordinates || !cleanCity)) {
      profileLocation = await this.prisma.userProfile.findUnique({
        where: { authId: options.authId },
        select: {
          currentLat: true,
          currentLng: true,
          city: true,
        },
      });
    }

    if (options.authId) {
      const settings = await this.prisma.userSettings.findUnique({
        where: { authId: options.authId },
        select: { favoriteSport: true },
      });
      preferredSport = settings?.favoriteSport ?? null;

      if (!preferredSport) {
        const profile = await this.prisma.userProfile.findUnique({
          where: { authId: options.authId },
          select: { preferredSport: true },
        });
        preferredSport = profile?.preferredSport ?? null;
      }
    }

    const userLat = hasValidCoordinates
      ? options.queryLat
      : (profileLocation?.currentLat ?? undefined);
    const userLng = hasValidCoordinates
      ? options.queryLng
      : (profileLocation?.currentLng ?? undefined);
    const userCity = cleanCity ?? profileLocation?.city ?? null;
    const requestedRadius =
      typeof options.queryRadiusKm === 'number'
        ? options.queryRadiusKm
        : undefined;
    const radiusKm = this.clampRadius(requestedRadius ?? DEFAULT_RADIUS_KM);

    return {
      userLat,
      userLng,
      userCity,
      radiusKm,
      preferredSport,
    };
  }

  private clampRadius(value: number) {
    return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, value));
  }

  private isValidLatitude(lat?: number): boolean {
    return (
      typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90
    );
  }

  private isValidLongitude(lng?: number): boolean {
    return (
      typeof lng === 'number' &&
      Number.isFinite(lng) &&
      lng >= -180 &&
      lng <= 180
    );
  }

  // ─────────────────────────────────────────
  // Section 1 — Top Recommended
  // Score = rating * 0.5 + reviewCount * 0.2 + proximity bonus * 0.3
  // ─────────────────────────────────────────

  private buildTopRecommended(
    turfs: RawTurf[],
    userLat?: number,
    userLng?: number,
    preferredSport: SportsType | null = null,
  ): UserHomeSectionDto {
    const MAX_DIST = 50; // km cap for proximity bonus

    const scored = turfs.map((t) => {
      const rating = typeof t._avg?.rating === 'number' ? t._avg.rating : 0;
      const reviews = t._count?.reviews ?? 0;
      const dist = this.getDistance(t, userLat, userLng);

      // Normalised proximity score: 1 = very close, 0 = far or unknown
      const proximityScore =
        dist != null ? Math.max(0, 1 - dist / MAX_DIST) : 0.5;

      // Normalised rating (out of 5) + log-scaled review boost
      const ratingScore = rating / 5;
      const reviewScore = Math.min(reviews / 50, 1); // cap at 50 reviews = 1.0

      const score =
        ratingScore * 0.5 + reviewScore * 0.2 + proximityScore * 0.3;

      return { turf: t, dist, score };
    });

    const prioritized = this.prioritizeByPreferredSport(
      scored
        .filter(
          (s) =>
            (s.turf._avg?.rating ?? 0) >= MIN_RATING_THRESHOLD ||
            (s.turf._count?.reviews ?? 0) === 0,
        )
        .sort((a, b) => b.score - a.score)
        .map((s) => ({ ...s, sportsType: s.turf.sportsType })),
      preferredSport,
    ).map(({ sportsType: _sportsType, ...rest }) => rest);

    const top = prioritized.slice(0, SECTION_LIMIT);

    return {
      sectionType: HomeSectionType.TOP_RECOMMENDED,
      title: 'Top Recommended',
      subtitle: 'Best turfs handpicked for you',
      turfs: top.map((s) => this.toCard(s.turf, s.dist)),
    };
  }

  // ─────────────────────────────────────────
  // Section 2 — Most Rated
  // Primary: rating DESC, secondary: reviewCount DESC
  // ─────────────────────────────────────────

  private buildMostRated(
    turfs: RawTurf[],
    userLat?: number,
    userLng?: number,
    preferredSport: SportsType | null = null,
  ): UserHomeSectionDto {
    const sorted = this.prioritizeByPreferredSport(
      [...turfs].sort((a, b) => {
        const rA = a._avg?.rating ?? 0;
        const rB = b._avg?.rating ?? 0;
        if (rB !== rA) return rB - rA;
        return (b._count?.reviews ?? 0) - (a._count?.reviews ?? 0);
      }),
      preferredSport,
    ).slice(0, SECTION_LIMIT);

    return {
      sectionType: HomeSectionType.MOST_RATED,
      title: 'Most Rated',
      subtitle: 'Highest rated turfs by players',
      turfs: sorted.map((t) =>
        this.toCard(t, this.getDistance(t, userLat, userLng)),
      ),
    };
  }

  // ─────────────────────────────────────────
  // Section 3 — Budget Friendly
  // weekdayDayPrice <= BUDGET_MAX_PRICE, sorted by price ASC
  // ─────────────────────────────────────────

  private buildBudgetFriendly(
    turfs: RawTurf[],
    userLat?: number,
    userLng?: number,
    preferredSport: SportsType | null = null,
  ): UserHomeSectionDto {
    const sorted = this.prioritizeByPreferredSport(
      turfs
        .filter((t) => t.weekdayDayPrice <= BUDGET_MAX_PRICE)
        .sort((a, b) => a.weekdayDayPrice - b.weekdayDayPrice),
      preferredSport,
    ).slice(0, SECTION_LIMIT);

    return {
      sectionType: HomeSectionType.BUDGET_FRIENDLY,
      title: 'Budget Friendly',
      subtitle: `Quality turfs under ₹${BUDGET_MAX_PRICE}/hr`,
      turfs: sorted.map((t) =>
        this.toCard(t, this.getDistance(t, userLat, userLng)),
      ),
    };
  }

  // ─────────────────────────────────────────
  // Section 4 — Nearby
  // Sorted by distance ASC, within DEFAULT_RADIUS_KM
  // Falls back to city-based if no coordinates
  // ─────────────────────────────────────────

  private buildNearby(
    turfs: RawTurf[],
    userLat?: number,
    userLng?: number,
    radiusKm: number = DEFAULT_RADIUS_KM,
    userCity?: string | null,
    preferredSport: SportsType | null = null,
  ): UserHomeSectionDto {
    let nearbyTurfs: { turf: RawTurf; dist: number | null }[] = [];

    if (userLat != null && userLng != null) {
      // GPS-based
      nearbyTurfs = this.prioritizeByPreferredSport(
        turfs
          .map((t) => ({
            turf: t,
            dist: this.getDistance(t, userLat, userLng),
          }))
          .filter((s) => s.dist != null && s.dist <= radiusKm)
          .sort((a, b) => (a.dist ?? 999) - (b.dist ?? 999))
          .map((s) => ({ ...s, sportsType: s.turf.sportsType })),
        preferredSport,
      )
        .map(({ sportsType: _sportsType, ...rest }) => rest)
        .slice(0, SECTION_LIMIT);
    } else if (userCity) {
      // Fallback: same city
      nearbyTurfs = this.prioritizeByPreferredSport(
        turfs.filter((t) => t.city.toLowerCase() === userCity.toLowerCase()),
        preferredSport,
      )
        .map((t) => ({ turf: t, dist: null }))
        .slice(0, SECTION_LIMIT);
    }

    return {
      sectionType: HomeSectionType.NEARBY,
      title: 'Nearby Turfs',
      subtitle:
        userLat != null
          ? `Turfs within ${radiusKm} km of you`
          : 'Turfs in your city',
      turfs: nearbyTurfs.map((s) => this.toCard(s.turf, s.dist)),
    };
  }

  // ─────────────────────────────────────────
  // Section 5 — Most Demanded
  // Proxy: combination of rating + review count (high traffic signal)
  // When booking model is added, replace with booking count sort
  // ─────────────────────────────────────────

  private buildMostDemanded(
    turfs: RawTurf[],
    userLat?: number,
    userLng?: number,
    preferredSport: SportsType | null = null,
  ): UserHomeSectionDto {
    // Demand score = reviewCount * 0.6 + rating * 0.4
    // When bookings table exists: replace with actual booking count DESC
    const scored = this.prioritizeByPreferredSport(
      turfs
        .map((t) => {
          const reviews = t._count?.reviews ?? 0;
          const rating = t._avg?.rating ?? 0;
          const demandScore = reviews * 0.6 + (rating / 5) * 100 * 0.4;
          return { turf: t, score: demandScore, sportsType: t.sportsType };
        })
        .sort((a, b) => b.score - a.score),
      preferredSport,
    )
      .map(({ sportsType: _sportsType, ...rest }) => rest)
      .slice(0, SECTION_LIMIT);

    return {
      sectionType: HomeSectionType.MOST_DEMANDED,
      title: 'Most Demanded',
      subtitle: 'Popular turfs players love to book',
      turfs: scored.map((s) =>
        this.toCard(s.turf, this.getDistance(s.turf, userLat, userLng)),
      ),
    };
  }

  // ─────────────────────────────────────────
  // Section 6 — Newly Opened
  // createdAt within last NEW_TURF_DAYS days, sorted newest first
  // ─────────────────────────────────────────

  private buildNewlyOpened(
    turfs: RawTurf[],
    userLat?: number,
    userLng?: number,
    preferredSport: SportsType | null = null,
  ): UserHomeSectionDto {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - NEW_TURF_DAYS);

    const recent = this.prioritizeByPreferredSport(
      turfs
        .filter((t) => new Date(t.createdAt) >= cutoff)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      preferredSport,
    ).slice(0, SECTION_LIMIT);

    return {
      sectionType: HomeSectionType.NEWLY_OPENED,
      title: 'Newly Opened',
      subtitle: `Fresh turfs added in the last ${NEW_TURF_DAYS} days`,
      turfs: recent.map((t) =>
        this.toCard(t, this.getDistance(t, userLat, userLng)),
      ),
    };
  }

  private buildRecentlyViewed(
    turfs: RawTurf[],
    userLat?: number,
    userLng?: number,
    preferredSport: SportsType | null = null,
  ): UserHomeSectionDto {
    const sorted = this.prioritizeByPreferredSport(
      [...turfs].sort((a, b) => {
        const updatedA = new Date(a.updatedAt).getTime();
        const updatedB = new Date(b.updatedAt).getTime();
        return updatedB - updatedA;
      }),
      preferredSport,
    ).slice(0, SECTION_LIMIT);

    return {
      sectionType: HomeSectionType.RECENTLY_VIEWED,
      title: 'Recently Viewed',
      subtitle: 'Turfs you recently opened or checked',
      turfs: sorted.map((t) =>
        this.toCard(t, this.getDistance(t, userLat, userLng)),
      ),
    };
  }
}
