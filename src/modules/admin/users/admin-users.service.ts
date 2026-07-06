import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Parser } from 'json2csv';
import * as pdfkit from 'pdfkit';

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(query: { search?: string; status?: 'active' | 'suspended' | 'deleted'; page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = { role: 'USER' };

    if (query.status === 'active') {
      where.isBanned = false;
      where.deletedAt = null;
    } else if (query.status === 'suspended') {
      where.isBanned = true;
      where.deletedAt = null;
    } else if (query.status === 'deleted') {
      where.deletedAt = { not: null };
    } else {
      where.deletedAt = null;
    }

    if (query.search) {
      where.OR = [
        { phone: { contains: query.search, mode: 'insensitive' } },
        { userProfile: { name: { contains: query.search, mode: 'insensitive' } } },
        { userProfile: { email: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [total, users] = await Promise.all([
      this.prisma.auth.count({ where }),
      this.prisma.auth.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { userProfile: true },
      }),
    ]);

    return {
      success: true,
      data: {
        users,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getUserDetails(id: string) {
    const user = await this.prisma.auth.findUnique({
      where: { id },
      include: { userProfile: true },
    });
    if (!user || user.role !== 'USER') throw new NotFoundException('User not found');

    const bookings = await this.prisma.booking.findMany({
      where: { userId: id },
      select: { amount: true, bookingStatus: true },
    });

    const totalBookings = bookings.length;
    const totalSpent = bookings
      .filter(b => b.bookingStatus === 'COMPLETED' || b.bookingStatus === 'CONFIRMED')
      .reduce((sum, b) => sum + b.amount, 0);

    const bookingHistorySummary = bookings.reduce((acc: any, b) => {
      acc[b.bookingStatus] = (acc[b.bookingStatus] || 0) + 1;
      return acc;
    }, {});

    let status = 'ACTIVE';
    if (user.deletedAt) {
      status = 'DELETED';
    } else if (user.isBanned) {
      status = 'SUSPENDED';
    }

    return {
      success: true,
      data: {
        profile: {
          id: user.id,
          phone: user.phone,
          isBanned: user.isBanned,
          banReason: user.banReason,
          bannedAt: user.bannedAt,
          createdAt: user.createdAt,
          deletedAt: user.deletedAt,
          userProfile: user.userProfile,
        },
        bookingHistorySummary,
        walletDetails: null,
        totalBookings,
        totalSpent,
        status,
      },
    };
  }

  async suspendUser(id: string, reason: string, adminId: string, ipAddress: string) {
    const user = await this.prisma.auth.findFirst({ where: { id, role: 'USER' } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.auth.update({
      where: { id },
      data: {
        isBanned: true,
        banReason: reason,
        bannedAt: new Date(),
        bannedBy: adminId,
      },
    });

    await this.prisma.adminActionLog.create({
      data: {
        adminId,
        action: 'USER_BANNED',
        targetType: 'User',
        targetId: id,
        reason,
        ipAddress,
      },
    });

    return { success: true, data: updated };
  }

  async activateUser(id: string, adminId: string, ipAddress: string) {
    const user = await this.prisma.auth.findFirst({ where: { id, role: 'USER' } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.auth.update({
      where: { id },
      data: {
        isBanned: false,
        banReason: null,
        bannedAt: null,
        bannedBy: null,
      },
    });

    await this.prisma.adminActionLog.create({
      data: {
        adminId,
        action: 'USER_UNBANNED',
        targetType: 'User',
        targetId: id,
        reason: 'Unbanned by admin',
        ipAddress,
      },
    });

    return { success: true, data: updated };
  }

  async softDeleteUser(id: string, adminId: string, ipAddress: string) {
    const user = await this.prisma.auth.findFirst({ where: { id, role: 'USER', deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.auth.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.prisma.adminActionLog.create({
      data: {
        adminId,
        action: 'USER_UNBANNED',
        targetType: 'User',
        targetId: id,
        reason: 'Soft deleted by admin',
        ipAddress,
        metadata: { actionDetail: 'SOFT_DELETE' },
      },
    });

    return { success: true, data: updated };
  }

  async getBookingHistory(id: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { userId: id },
      include: { turf: { select: { name: true, city: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: bookings };
  }

  async exportUsersCsv(): Promise<string> {
    const users = await this.prisma.auth.findMany({
      where: { role: 'USER', deletedAt: null },
      include: { userProfile: true },
    });

    const data = users.map((u) => ({
      id: u.id,
      phone: u.phone,
      name: u.userProfile?.name || 'N/A',
      email: u.userProfile?.email || 'N/A',
      city: u.userProfile?.city || 'N/A',
      status: u.isBanned ? 'SUSPENDED' : 'ACTIVE',
      createdAt: u.createdAt,
    }));

    const fields = [
      { label: 'User ID', value: 'id' },
      { label: 'Phone', value: 'phone' },
      { label: 'Name', value: 'name' },
      { label: 'Email', value: 'email' },
      { label: 'City', value: 'city' },
      { label: 'Status', value: 'status' },
      { label: 'Registered At', value: 'createdAt' },
    ];

    const json2csvParser = new Parser({ fields });
    return json2csvParser.parse(data);
  }

  async exportUsersPdf(): Promise<Buffer> {
    const users = await this.prisma.auth.findMany({
      where: { role: 'USER', deletedAt: null },
      include: { userProfile: true },
      take: 50,
    });

    return new Promise((resolve, reject) => {
      const doc = new ((pdfkit as any).default || (pdfkit as any))({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('Turfsy Users Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
      doc.moveDown();

      doc.fontSize(10).text('ID | Name | Phone | Email | City | Status', { underline: true });
      doc.moveDown();

      for (const u of users) {
        doc.fontSize(9).text(
          `${u.id.substring(0, 8)}... | ${u.userProfile?.name || 'N/A'} | ${u.phone} | ${u.userProfile?.email || 'N/A'} | ${u.userProfile?.city || 'N/A'} | ${u.isBanned ? 'SUSPENDED' : 'ACTIVE'}`
        );
        doc.moveDown(0.5);
      }

      doc.end();
    });
  }
}
