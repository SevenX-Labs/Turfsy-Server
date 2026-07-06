import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Parser } from 'json2csv';
import * as pdfkit from 'pdfkit';

@Injectable()
export class AdminOwnersService {
  constructor(private readonly prisma: PrismaService) {}

  async listOwners(query: { search?: string; status?: 'active' | 'suspended'; page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = { role: 'OWNER', deletedAt: null };

    if (query.status === 'active') {
      where.isBanned = false;
    } else if (query.status === 'suspended') {
      where.isBanned = true;
    }

    if (query.search) {
      where.OR = [
        { phone: { contains: query.search, mode: 'insensitive' } },
        { ownerProfile: { name: { contains: query.search, mode: 'insensitive' } } },
        { ownerProfile: { email: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [total, owners] = await Promise.all([
      this.prisma.auth.count({ where }),
      this.prisma.auth.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          ownerProfile: {
            include: {
              _count: { select: { turfs: true } },
            },
          },
        },
      }),
    ]);

    // Map stats for each owner
    const ownersWithStats = await Promise.all(
      owners.map(async (authObj) => {
        const ownerProfile = authObj.ownerProfile;
        let totalEarnings = 0;
        let totalTurfs = 0;

        if (ownerProfile) {
          totalTurfs = ownerProfile._count.turfs;

          // Sum of bookings revenue for this owner
          const revenueAgg = await this.prisma.booking.aggregate({
            where: {
              bookingStatus: 'COMPLETED',
              turf: { ownerProfileId: ownerProfile.id },
            },
            _sum: { amount: true, platformFee: true },
          });

          const totalAmount = revenueAgg._sum.amount || 0;
          const totalFee = revenueAgg._sum.platformFee || 0;
          totalEarnings = Math.max(0, totalAmount - totalFee);
        }

        return {
          id: authObj.id,
          phone: authObj.phone,
          isBanned: authObj.isBanned,
          createdAt: authObj.createdAt,
          profile: ownerProfile ? {
            id: ownerProfile.id,
            name: ownerProfile.name,
            email: ownerProfile.email,
            contactNumber: ownerProfile.contactNumber,
            totalTurfs,
            totalEarnings,
          } : null,
        };
      })
    );

    return {
      success: true,
      data: {
        owners: ownersWithStats,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getOwnerDetails(id: string) {
    const owner = await this.prisma.auth.findUnique({
      where: { id },
      include: { ownerProfile: true },
    });
    if (!owner || owner.role !== 'OWNER') throw new NotFoundException('Owner not found');

    const ownerProfile = owner.ownerProfile;
    if (!ownerProfile) throw new NotFoundException('Owner profile not found');

    // 1. Bank Details
    const payment = await this.prisma.payment.findFirst({
      where: { ownerProfileId: ownerProfile.id },
    });

    // 2. Settlement Summary
    const settlements = await this.prisma.settlement.findMany({
      where: { ownerProfileId: ownerProfile.id },
      orderBy: { createdAt: 'desc' },
    });

    // 3. Turf Count
    const turfCount = await this.prisma.turf.count({
      where: { ownerProfileId: ownerProfile.id, deletedAt: null },
    });

    // 4. Earnings
    const bookings = await this.prisma.booking.findMany({
      where: {
        turf: { ownerProfileId: ownerProfile.id },
      },
      select: { amount: true, platformFee: true, bookingStatus: true },
    });

    const totalEarnings = bookings
      .filter(b => b.bookingStatus === 'COMPLETED' || b.bookingStatus === 'CONFIRMED')
      .reduce((sum, b) => sum + (b.amount - b.platformFee), 0);

    // 5. Rating
    const turfRatings = await this.prisma.turfRating.aggregate({
      where: { turf: { ownerProfileId: ownerProfile.id } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const avgRating = turfRatings._avg.rating || 0;

    // 6. Active Bookings
    const activeBookingsCount = await this.prisma.booking.count({
      where: {
        turf: { ownerProfileId: ownerProfile.id },
        bookingStatus: { in: ['CONFIRMED', 'PENDING_APPROVAL'] },
      },
    });

    return {
      success: true,
      data: {
        owner: {
          id: owner.id,
          phone: owner.phone,
          isBanned: owner.isBanned,
          banReason: owner.banReason,
          bannedAt: owner.bannedAt,
          createdAt: owner.createdAt,
          deletedAt: owner.deletedAt,
          profile: ownerProfile,
        },
        bankDetails: payment || null,
        settlementSummary: settlements,
        turfCount,
        totalEarnings,
        rating: {
          average: avgRating,
          count: turfRatings._count.rating,
        },
        activeBookings: activeBookingsCount,
      },
    };
  }

  async suspendOwner(id: string, reason: string, adminId: string, ipAddress: string) {
    const owner = await this.prisma.auth.findFirst({ where: { id, role: 'OWNER' } });
    if (!owner) throw new NotFoundException('Owner not found');

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
        action: 'OWNER_BANNED',
        targetType: 'Owner',
        targetId: id,
        reason,
        ipAddress,
      },
    });

    return { success: true, data: updated };
  }

  async activateOwner(id: string, adminId: string, ipAddress: string) {
    const owner = await this.prisma.auth.findFirst({ where: { id, role: 'OWNER' } });
    if (!owner) throw new NotFoundException('Owner not found');

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
        action: 'OWNER_UNBANNED',
        targetType: 'Owner',
        targetId: id,
        reason: 'Unbanned by admin',
        ipAddress,
      },
    });

    return { success: true, data: updated };
  }

  async getBankDetails(id: string) {
    const owner = await this.prisma.auth.findFirst({
      where: { id, role: 'OWNER' },
      include: { ownerProfile: true },
    });
    if (!owner || !owner.ownerProfile) throw new NotFoundException('Owner or owner profile not found');

    const payment = await this.prisma.payment.findFirst({
      where: { ownerProfileId: owner.ownerProfile.id },
    });

    return {
      success: true,
      data: payment || { message: 'No bank details configured yet' },
    };
  }

  async getSettlementHistory(id: string) {
    const owner = await this.prisma.auth.findFirst({
      where: { id, role: 'OWNER' },
      include: { ownerProfile: true },
    });
    if (!owner || !owner.ownerProfile) throw new NotFoundException('Owner or owner profile not found');

    const settlements = await this.prisma.settlement.findMany({
      where: { ownerProfileId: owner.ownerProfile.id },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: settlements };
  }

  async exportOwnersCsv(): Promise<string> {
    const owners = await this.prisma.auth.findMany({
      where: { role: 'OWNER', deletedAt: null },
      include: { ownerProfile: true },
    });

    const data = owners.map((o) => ({
      id: o.id,
      phone: o.phone,
      name: o.ownerProfile?.name || 'N/A',
      email: o.ownerProfile?.email || 'N/A',
      contactNumber: o.ownerProfile?.contactNumber || 'N/A',
      status: o.isBanned ? 'SUSPENDED' : 'ACTIVE',
      createdAt: o.createdAt,
    }));

    const fields = [
      { label: 'Owner ID', value: 'id' },
      { label: 'Phone', value: 'phone' },
      { label: 'Name', value: 'name' },
      { label: 'Email', value: 'email' },
      { label: 'Contact Number', value: 'contactNumber' },
      { label: 'Status', value: 'status' },
      { label: 'Registered At', value: 'createdAt' },
    ];

    const json2csvParser = new Parser({ fields });
    return json2csvParser.parse(data);
  }

  async exportOwnersPdf(): Promise<Buffer> {
    const owners = await this.prisma.auth.findMany({
      where: { role: 'OWNER', deletedAt: null },
      include: { ownerProfile: true },
      take: 50,
    });

    return new Promise((resolve, reject) => {
      const doc = new ((pdfkit as any).default || (pdfkit as any))({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('Turfsy Owners Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
      doc.moveDown();

      doc.fontSize(10).text('ID | Name | Phone | Email | Contact Number | Status', { underline: true });
      doc.moveDown();

      for (const o of owners) {
        doc.fontSize(9).text(
          `${o.id.substring(0, 8)}... | ${o.ownerProfile?.name || 'N/A'} | ${o.phone} | ${o.ownerProfile?.email || 'N/A'} | ${o.ownerProfile?.contactNumber || 'N/A'} | ${o.isBanned ? 'SUSPENDED' : 'ACTIVE'}`
        );
        doc.moveDown(0.5);
      }

      doc.end();
    });
  }
}
