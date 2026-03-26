import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import { CreateTurfDto } from '../owner-profile/dto/create-turf.dto';
import { UpdateTurfDto } from '../owner-profile/dto/update-turf.dto';
import { TurfStatus } from '@prisma/client';

@Injectable()
export class TurfsService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Create a Turf
  async createTurf(authId: string, dto: CreateTurfDto) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Owner profile not found');
    if (!profile.name)
      throw new ForbiddenException('Please complete your owner profile first');

    const turf = await this.prisma.turf.create({
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
        groundDayUrl: '',
        entranceUrl: '',
      },
    });

    return {
      success: true,
      message: 'Turf created successfully',
      data: turf,
    };
  }

  // 2. Get All My Turfs (for Owners)
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
        // lat and lng are omitted here as per requirements
        ...(dto.openTime !== undefined && { openTime: dto.openTime }),
        ...(dto.closeTime !== undefined && { closeTime: dto.closeTime }),
        ...(dto.minSlotDurationMins !== undefined && { minSlotDurationMins: dto.minSlotDurationMins }),
        ...(dto.floodLights !== undefined && { floodLights: dto.floodLights }),
        ...(dto.parking !== undefined && { parking: dto.parking }),
        ...(dto.washroom !== undefined && { washroom: dto.washroom }),
        ...(dto.changingRoom !== undefined && { changingRoom: dto.changingRoom }),
        ...(dto.drinkingWater !== undefined && { drinkingWater: dto.drinkingWater }),
        ...(dto.seatingArea !== undefined && { seatingArea: dto.seatingArea }),
        ...(dto.cafeteria !== undefined && { cafeteria: dto.cafeteria }),
        ...(dto.weekdayDayPrice !== undefined && { weekdayDayPrice: dto.weekdayDayPrice }),
        ...(dto.weekdayNightPrice !== undefined && { weekdayNightPrice: dto.weekdayNightPrice }),
        ...(dto.weekendDayPrice !== undefined && { weekendDayPrice: dto.weekendDayPrice }),
        ...(dto.weekendNightPrice !== undefined && { weekendNightPrice: dto.weekendNightPrice }),
      },
    });

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

    return {
      success: true,
      message: `Turf status updated to ${status}`,
      data: { id: updated.id, status: updated.status },
    };
  }

  // 5. Get Turf Details (Consumer View)
  async getTurfDetails(turfId: string) {
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
        turf.seatingAreaUrl,
      ].filter(Boolean),
      rating: 4.5, // Placeholder
      rules: [
        'No smoking inside the turf',
        'Wear proper non-marking sports shoes',
        'Please arrive 10 minutes before your slot',
      ], 
      customerReviews: [
        { reviewerName: 'Rohit Sharma', rating: 5, comment: 'Excellent quality ground!' },
        { reviewerName: 'Virat Kohli', rating: 4, comment: 'Good pitch, floodlights could be better.' },
      ],
    };
  }

  // 6. Upload/Update Turf Images (Idempotent)
  async updateTurfImagesWithIdempotency(authId: string, turfId: string, images: any) {
    const profile = await this.prisma.ownerProfile.findUnique({
      where: { authId },
    });

    if (!profile) throw new NotFoundException('Owner profile not found');

    const turf = await this.prisma.turf.findUnique({ where: { id: turfId } });
    if (!turf) throw new NotFoundException('Turf not found');
    if (turf.ownerProfileId !== profile.id)
      throw new ForbiddenException('You are not allowed to update this turf');

    const deleteOldImage = (oldUrl: string | null) => {
      if (oldUrl) {
        try {
          const urlObj = new URL(oldUrl);
          const oldPath = `./${urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname}`;
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        } catch (e) {}
      }
    };

    if (images.entranceUrl) deleteOldImage(turf.entranceUrl);
    if (images.groundDayUrl) deleteOldImage(turf.groundDayUrl);
    if (images.groundNightUrl) deleteOldImage(turf.groundNightUrl);
    if (images.seatingAreaUrl) deleteOldImage(turf.seatingAreaUrl);

    const updated = await this.prisma.turf.update({
      where: { id: turfId },
      data: images,
    });

    return {
      success: true,
      message: 'Turf images updated successfully',
      data: updated,
    };
  }
}
