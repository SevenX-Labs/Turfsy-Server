import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const EVENING_WINDOW_START = 18; // 18:00
const EVENING_WINDOW_END = 24; // 00:00 (next day)
const TOTAL_EVENING_SLOTS = 6; // 6 one-hour slots from 18:00–00:00

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCalendarMultiplier(
    date: Date,
    startTime: string,
    turfId: string,
  ): Promise<{ multiplier: number; reason: string }> {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    const specialEvent = await this.prisma.specialEvent.findFirst({
      where: {
        date: normalizedDate,
        OR: [{ turfId }, { turfId: null }],
      },
      orderBy: { turfId: 'desc' }, // prefer turf-specific over global
    });

    if (specialEvent) {
      return {
        multiplier: specialEvent.multiplier,
        reason: `${specialEvent.eventType}: ${specialEvent.title}`,
      };
    }

    const dayOfWeek = date.getDay(); // 0=Sun, 5=Fri, 6=Sat
    const startHour = parseInt(startTime.split(':')[0], 10);

    // Weekend Prime: Sat–Sun, 18:00–00:00 (Sat-Sun only)
    if ([0, 6].includes(dayOfWeek) && startHour >= 18) {
      return { multiplier: 1.5, reason: 'Weekend Prime' };
    }

    // Weekend Day: Sat–Sun, 06:00–18:00
    if ([0, 6].includes(dayOfWeek) && startHour < 18) {
      return { multiplier: 1.2, reason: 'Weekend Day' };
    }

    // Friday Prime: Fri, 18:00–00:00
    if (dayOfWeek === 5 && startHour >= 18) {
      return { multiplier: 1.4, reason: 'Friday Prime' };
    }

    // Weekday Prime: Mon–Thu, 18:00–00:00 (Mon-Thu only)
    if ([1, 2, 3, 4].includes(dayOfWeek) && startHour >= 18) {
      return { multiplier: 1.3, reason: 'Weekday Prime' };
    }

    // Weekday Day: Mon–Fri, 06:00–18:00
    return { multiplier: 1.0, reason: 'Weekday Day' };
  }

  async getClusterOccupancySurge(
    turfId: string,
    date: Date,
  ): Promise<{ multiplier: number; badge: string | null; occupancyPercent: number }> {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    const bookedCount = await this.prisma.booking.count({
      where: {
        turfId,
        bookingDate: normalizedDate,
        startTime: { gte: '18:00' },
        bookingStatus: {
          notIn: ['CANCELLED', 'NO_SHOW', 'REJECTED'] as any[],
        },
      },
    });

    const occupancy = (bookedCount / TOTAL_EVENING_SLOTS) * 100;

    if (occupancy > 75) {
      return { multiplier: 1.3, badge: '⚡ High Demand', occupancyPercent: occupancy };
    }
    if (occupancy >= 40) {
      return { multiplier: 1.2, badge: '🔥 Filling Fast', occupancyPercent: occupancy };
    }
    return { multiplier: 1.0, badge: null, occupancyPercent: occupancy };
  }

  async calculateSlotPrice(params: {
    turfId: string;
    basePrice: number;
    date: Date;
    startTime: string;
    durationMins: number;
    isWaitlistClaim?: boolean;
    isPostCancellationPublic?: boolean;
  }): Promise<{
    finalPrice: number;
    basePrice: number;
    calendarMultiplier: number;
    calendarReason: string;
    occupancySurgeMultiplier: number;
    totalSurgeMultiplier: number;
    badge: string | null;
    occupancyPercent: number;
  }> {
    const hours = params.durationMins / 60;
    const basePriceForDuration = Math.round(params.basePrice * hours);

    // Waitlisted user claiming within 10-min window: base price only
    if (params.isWaitlistClaim) {
      return {
        finalPrice: basePriceForDuration,
        basePrice: params.basePrice,
        calendarMultiplier: 1.0,
        calendarReason: 'Waitlist Claim',
        occupancySurgeMultiplier: 1.0,
        totalSurgeMultiplier: 1.0,
        badge: null,
        occupancyPercent: 0,
      };
    }

    // Post-cancellation slot released to public after 10 min
    if (params.isPostCancellationPublic) {
      const finalPrice = Math.round(basePriceForDuration * 1.2);
      return {
        finalPrice,
        basePrice: params.basePrice,
        calendarMultiplier: 1.0,
        calendarReason: 'Post-Cancellation Surge',
        occupancySurgeMultiplier: 1.2,
        totalSurgeMultiplier: 1.2,
        badge: '🔥 Last-Minute Hot Slot',
        occupancyPercent: 0,
      };
    }

    const calendar = await this.getCalendarMultiplier(
      params.date,
      params.startTime,
      params.turfId,
    );

    const occupancy = await this.getClusterOccupancySurge(
      params.turfId,
      params.date,
    );

    const totalMultiplier = calendar.multiplier * occupancy.multiplier;
    let finalPrice = Math.round(basePriceForDuration * totalMultiplier);
    if (totalMultiplier > 1.0 && finalPrice <= basePriceForDuration && basePriceForDuration > 0) {
      finalPrice = basePriceForDuration + 1;
    }

    const badge =
      occupancy.badge ||
      (calendar.multiplier > 1.0 ? `⚡ ${calendar.reason}` : null);

    return {
      finalPrice,
      basePrice: params.basePrice,
      calendarMultiplier: calendar.multiplier,
      calendarReason: calendar.reason,
      occupancySurgeMultiplier: occupancy.multiplier,
      totalSurgeMultiplier: totalMultiplier,
      badge,
      occupancyPercent: occupancy.occupancyPercent,
    };
  }

  async getSlotPricing(
    turfId: string,
    date: Date,
    openTime: string,
    closeTime: string,
    weekdayDayPrice: number,
  ): Promise<{
    slotPricing: Array<{
      startTime: string;
      endTime: string;
      basePrice: number;
      finalPrice: number;
      surgeMultiplier: number;
      badge: string | null;
      isWaitlistAvailable: boolean;
      waitlistCount: number;
    }>;
    clusterOccupancyPercent: number;
  }> {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    const occupancy = await this.getClusterOccupancySurge(turfId, date);

    // Generate 1-hour slots from openTime to closeTime
    const slots: Array<{
      startTime: string;
      endTime: string;
      basePrice: number;
      finalPrice: number;
      surgeMultiplier: number;
      badge: string | null;
      isWaitlistAvailable: boolean;
      waitlistCount: number;
    }> = [];

    const openHour = parseInt(openTime.split(':')[0], 10);
    const closeHour = parseInt(closeTime.split(':')[0], 10);
    const isOvernight = closeHour <= openHour && openTime !== closeTime;
    const is24Hour = openTime === closeTime;

    const maxHour = is24Hour ? 24 : isOvernight ? 24 + closeHour : closeHour;

    // Get all active bookings for this date
    const activeBookings = await this.prisma.booking.findMany({
      where: {
        turfId,
        bookingDate: normalizedDate,
        bookingStatus: {
          notIn: ['CANCELLED', 'NO_SHOW', 'REJECTED'] as any[],
        },
      },
      select: { startTime: true, endTime: true },
    });

    // Get waitlist counts
    const waitlistEntries = await this.prisma.waitlist.findMany({
      where: {
        turfId,
        bookingDate: normalizedDate,
        status: 'WAITING',
      },
      select: { startTime: true },
    });

    // Find recently cancelled slots that have expired waitlist windows
    const expiredWaitlists = await this.prisma.waitlist.findMany({
      where: {
        turfId,
        bookingDate: normalizedDate,
        status: 'EXPIRED',
      },
      select: { startTime: true },
    });

    for (let h = openHour; h < maxHour; h++) {
      const hour = h % 24;
      const nextHour = (h + 1) % 24;
      const startTimeStr = `${hour.toString().padStart(2, '0')}:00`;
      const endTimeStr = `${nextHour.toString().padStart(2, '0')}:00`;

      const isBooked = activeBookings.some(
        (b) => b.startTime < endTimeStr && b.endTime > startTimeStr,
      );

      const waitlistCount = waitlistEntries.filter(
        (w) => w.startTime === startTimeStr,
      ).length;

      const isPostCancellationPublic = expiredWaitlists.some(
        (w) => w.startTime === startTimeStr,
      ) && !isBooked;

      const pricing = await this.calculateSlotPrice({
        turfId,
        basePrice: weekdayDayPrice,
        date,
        startTime: startTimeStr,
        durationMins: 60,
        isPostCancellationPublic,
      });

      slots.push({
        startTime: startTimeStr,
        endTime: endTimeStr,
        basePrice: weekdayDayPrice,
        finalPrice: pricing.finalPrice,
        surgeMultiplier: pricing.totalSurgeMultiplier,
        badge: pricing.badge,
        isWaitlistAvailable: isBooked,
        waitlistCount,
      });
    }

    return {
      slotPricing: slots,
      clusterOccupancyPercent: occupancy.occupancyPercent,
    };
  }
}
