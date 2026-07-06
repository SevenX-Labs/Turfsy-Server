import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TurfStatus } from '@prisma/client';

@Injectable()
export class AdminTurfsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTurfs(query: { search?: string; status?: TurfStatus; city?: string; page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };

    if (query.status) {
      where.status = query.status;
    }
    if (query.city) {
      where.city = { contains: query.city, mode: 'insensitive' };
    }
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [total, turfs] = await Promise.all([
      this.prisma.turf.count({ where }),
      this.prisma.turf.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: {
            select: { name: true, contactNumber: true, email: true },
          },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        turfs,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getTurfDetails(id: string) {
    const turf = await this.prisma.turf.findUnique({
      where: { id },
      include: {
        owner: true,
        maintenanceRecords: {
          orderBy: { startDate: 'desc' },
        },
        ratings: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!turf || turf.deletedAt) throw new NotFoundException('Turf not found');

    return { success: true, data: turf };
  }

  async updateTurfStatus(id: string, status: TurfStatus, adminId: string, ipAddress: string, reason?: string) {
    const turf = await this.prisma.turf.findUnique({ where: { id } });
    if (!turf) throw new NotFoundException('Turf not found');

    const updated = await this.prisma.turf.update({
      where: { id },
      data: {
        status,
        suspensionReason: status === 'SUSPENDED' ? (reason || 'Suspended by admin') : null,
        suspendedAt: status === 'SUSPENDED' ? new Date() : null,
        suspendedBy: status === 'SUSPENDED' ? adminId : null,
      },
    });

    // Determine audit action type
    const action = status === 'ACTIVE' ? 'TURF_ACTIVATED' : 'TURF_SUSPENDED';

    await this.prisma.adminActionLog.create({
      data: {
        adminId,
        action,
        targetType: 'Turf',
        targetId: id,
        reason: `Status changed to ${status}${reason ? ': ' + reason : ''}`,
        ipAddress,
      },
    });

    return { success: true, data: updated };
  }

  async featureTurf(id: string, adminId: string, ipAddress: string) {
    const turf = await this.prisma.turf.findUnique({ where: { id } });
    if (!turf) throw new NotFoundException('Turf not found');

    const updated = await this.prisma.turf.update({
      where: { id },
      data: {
        isFeatured: true,
        featuredAt: new Date(),
        featuredBy: adminId,
      },
    });

    await this.prisma.adminActionLog.create({
      data: {
        adminId,
        action: 'TURF_FEATURED',
        targetType: 'Turf',
        targetId: id,
        reason: 'Featured by admin',
        ipAddress,
      },
    });

    return { success: true, data: updated };
  }

  async unfeatureTurf(id: string, adminId: string, ipAddress: string) {
    const turf = await this.prisma.turf.findUnique({ where: { id } });
    if (!turf) throw new NotFoundException('Turf not found');

    const updated = await this.prisma.turf.update({
      where: { id },
      data: {
        isFeatured: false,
        featuredAt: null,
        featuredBy: null,
      },
    });

    await this.prisma.adminActionLog.create({
      data: {
        adminId,
        action: 'TURF_UNFEATURED',
        targetType: 'Turf',
        targetId: id,
        reason: 'Unfeatured by admin',
        ipAddress,
      },
    });

    return { success: true, data: updated };
  }

  async setTurfMaintenance(
    id: string,
    dto: { startDate: Date; endDate: Date; reason?: string },
    adminId: string,
    ipAddress: string,
  ) {
    const turf = await this.prisma.turf.findUnique({ where: { id } });
    if (!turf) throw new NotFoundException('Turf not found');

    // Create record in TurfMaintenance
    const maintenance = await this.prisma.turfMaintenance.create({
      data: {
        turfId: id,
        startDate: dto.startDate,
        endDate: dto.endDate,
        reason: dto.reason,
        createdBy: adminId,
      },
    });

    // Update turf status to MAINTENANCE
    await this.prisma.turf.update({
      where: { id },
      data: { status: 'MAINTENANCE' },
    });

    await this.prisma.adminActionLog.create({
      data: {
        adminId,
        action: 'TURF_SUSPENDED',
        targetType: 'Turf',
        targetId: id,
        reason: `Placed in maintenance window: ${dto.reason || 'N/A'}`,
        ipAddress,
        metadata: { maintenanceId: maintenance.id },
      },
    });

    return { success: true, data: maintenance };
  }
}
