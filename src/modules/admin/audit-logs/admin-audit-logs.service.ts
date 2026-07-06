import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdminActionType } from '@prisma/client';

@Injectable()
export class AdminAuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAuditLogs(query: {
    search?: string;
    action?: AdminActionType;
    adminId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.action) {
      where.action = query.action;
    }
    if (query.adminId) {
      where.adminId = query.adminId;
    }
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        // Handle end of day
        where.createdAt.lte = new Date(query.dateTo + 'T23:59:59.999Z');
      }
    }

    if (query.search) {
      where.OR = [
        { reason: { contains: query.search, mode: 'insensitive' } },
        { targetType: { contains: query.search, mode: 'insensitive' } },
        { targetId: { contains: query.search, mode: 'insensitive' } },
        { admin: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [total, logs] = await Promise.all([
      this.prisma.adminActionLog.count({ where }),
      this.prisma.adminActionLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          admin: {
            select: { name: true, email: true },
          },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }
}
