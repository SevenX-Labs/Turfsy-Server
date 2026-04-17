import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Trigger IDE TS Server reload
@Injectable()
export class SavedTurfsService {
  constructor(private readonly prisma: PrismaService) {}

  async saveTurf(authId: string, turfId: string, notes?: string) {
    const turf = await this.prisma.turf.findUnique({ where: { id: turfId } });
    if (!turf) {
      throw new NotFoundException('Turf not found');
    }

    const existing = await this.prisma.savedTurf.findUnique({
      where: {
        userId_turfId: {
          userId: authId,
          turfId: turfId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Turf already saved');
    }

    const saved = await this.prisma.savedTurf.create({
      data: {
        userId: authId,
        turfId,
        notes,
      },
    });

    return {
      success: true,
      message: 'Turf saved successfully',
      data: saved,
    };
  }

  async unsaveTurf(authId: string, turfId: string) {
    const existing = await this.prisma.savedTurf.findUnique({
      where: {
        userId_turfId: {
          userId: authId,
          turfId: turfId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Saved turf not found');
    }

    await this.prisma.savedTurf.delete({
      where: {
        id: existing.id,
      },
    });

    return {
      success: true,
      message: 'Turf unsaved successfully',
    };
  }

  async getSavedTurfs(authId: string) {
    const savedTurfs = await this.prisma.savedTurf.findMany({
      take: 500, // Hard limit to prevent OOM from malicious users
      where: { userId: authId },
      include: {
        turf: {
          include: {
            owner: {
              select: { name: true, contactNumber: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = savedTurfs.map((st) => {
      const turf = st.turf;
      return {
        savedId: st.id,
        savedAt: st.createdAt,
        notes: st.notes,
        turfDetails: {
          ...turf,
          images: [
            turf.entranceUrl,
            turf.groundDayUrl,
            turf.groundNightUrl,
          ].filter(Boolean),
        },
      };
    });

    return {
      success: true,
      count: formatted.length,
      data: formatted,
    };
  }
}
