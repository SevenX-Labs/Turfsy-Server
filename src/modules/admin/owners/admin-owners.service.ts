import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Parser } from 'json2csv';
import * as pdfkit from 'pdfkit';

@Injectable()
export class AdminOwnersService {
  constructor(private readonly prisma: PrismaService) {}

  async listOwners(query: {
    search?: string;
    status?: 'active' | 'suspended';
    page?: number;
    limit?: number;
  }) {
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
        {
          ownerProfile: {
            name: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          ownerProfile: {
            email: { contains: query.search, mode: 'insensitive' },
          },
        },
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
            _sum: { amount: true },
          });

          totalEarnings = revenueAgg._sum.amount || 0;
        }

        return {
          id: authObj.id,
          phone: authObj.phone,
          isBanned: authObj.isBanned,
          createdAt: authObj.createdAt,
          profile: ownerProfile
            ? {
                id: ownerProfile.id,
                name: ownerProfile.name,
                email: ownerProfile.email,
                contactNumber: ownerProfile.contactNumber,
                totalTurfs,
                totalEarnings,
              }
            : null,
        };
      }),
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
    if (!owner || owner.role !== 'OWNER')
      throw new NotFoundException('Owner not found');

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
      select: { amount: true, bookingStatus: true },
    });

    const totalEarnings = bookings
      .filter(
        (b) =>
          b.bookingStatus === 'COMPLETED' || b.bookingStatus === 'CONFIRMED',
      )
      .reduce((sum, b) => sum + b.amount, 0);

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

  async suspendOwner(
    id: string,
    reason: string,
    adminId: string,
    ipAddress: string,
  ) {
    const owner = await this.prisma.auth.findFirst({
      where: { id, role: 'OWNER' },
    });
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
    const owner = await this.prisma.auth.findFirst({
      where: { id, role: 'OWNER' },
    });
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
    if (!owner || !owner.ownerProfile)
      throw new NotFoundException('Owner or owner profile not found');

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
    if (!owner || !owner.ownerProfile)
      throw new NotFoundException('Owner or owner profile not found');

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
      orderBy: { createdAt: 'desc' },
    });

    return new Promise((resolve, reject) => {
      const doc = new ((pdfkit as any).default || (pdfkit as any))({
        size: 'A4',
        margin: 40,
        bufferPages: true,
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Colors
      const primaryColor = '#4F46E5';
      const textColor = '#1F2937';
      const lightGray = '#F9FAFB';
      const borderGray = '#E5E7EB';
      const activeColor = '#059669';
      const bannedColor = '#DC2626';

      // Header block
      doc.rect(40, 40, 515, 60).fill(primaryColor);
      doc.fillColor('#FFFFFF');
      doc.fontSize(16).font('Helvetica-Bold').text('TURFSY ADMIN', 55, 52);
      doc
        .fontSize(10)
        .font('Helvetica')
        .text('Owners Directory & Account Audit', 55, 74);

      // Date meta info
      doc
        .fontSize(8)
        .font('Helvetica')
        .text(`Generated: ${new Date().toLocaleString()}`, 380, 55, {
          align: 'right',
          width: 160,
        });
      doc.text(`Total Records: ${owners.length}`, 380, 72, {
        align: 'right',
        width: 160,
      });

      // Table Setup
      let y = 120;
      const headers = ['#', 'Name', 'Phone', 'Email', 'Contact No', 'Status'];
      const colWidths = [25, 110, 85, 160, 85, 50];
      const startX = 40;

      // Draw table header
      doc.rect(startX, y, 515, 20).fill('#ECECFE');
      doc.fillColor('#1F2937');
      doc.fontSize(8).font('Helvetica-Bold');

      let currentX = startX;
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], currentX + 5, y + 6, {
          width: colWidths[i] - 10,
          align: i === 0 ? 'center' : 'left',
        });
        currentX += colWidths[i];
      }
      y += 20;

      // Table rows
      doc.font('Helvetica').fontSize(8);
      let count = 1;

      for (const o of owners) {
        // Page overflow check
        if (y > 750) {
          doc.addPage();
          y = 50; // Reset Y on new page

          // Re-draw header on new page
          doc.rect(startX, y, 515, 20).fill('#ECECFE');
          doc.fillColor('#1F2937');
          doc.fontSize(8).font('Helvetica-Bold');

          let cx = startX;
          for (let i = 0; i < headers.length; i++) {
            doc.text(headers[i], cx + 5, y + 6, {
              width: colWidths[i] - 10,
              align: i === 0 ? 'center' : 'left',
            });
            cx += colWidths[i];
          }
          y += 20;
          doc.font('Helvetica').fontSize(8);
        }

        // Draw background for zebra striping
        if (count % 2 === 0) {
          doc.rect(startX, y, 515, 22).fill(lightGray);
        }

        // Draw horizontal line at bottom of row
        doc
          .strokeColor(borderGray)
          .lineWidth(0.5)
          .moveTo(startX, y + 22)
          .lineTo(startX + 515, y + 22)
          .stroke();

        // Print cell text
        doc.fillColor(textColor);

        let cx = startX;
        // #
        doc.text(count.toString(), cx + 5, y + 7, {
          width: colWidths[0] - 10,
          align: 'center',
        });
        cx += colWidths[0];

        // Name
        doc
          .font('Helvetica-Bold')
          .text(o.ownerProfile?.name || 'N/A', cx + 5, y + 7, {
            width: colWidths[1] - 10,
            ellipsis: true,
          });
        doc.font('Helvetica');
        cx += colWidths[1];

        // Phone
        doc.text(o.phone || 'N/A', cx + 5, y + 7, {
          width: colWidths[2] - 10,
          ellipsis: true,
        });
        cx += colWidths[2];

        // Email
        doc.text(o.ownerProfile?.email || 'N/A', cx + 5, y + 7, {
          width: colWidths[3] - 10,
          ellipsis: true,
        });
        cx += colWidths[3];

        // Contact Number
        doc.text(o.ownerProfile?.contactNumber || 'N/A', cx + 5, y + 7, {
          width: colWidths[4] - 10,
          ellipsis: true,
        });
        cx += colWidths[4];

        // Status
        const statusText = o.isBanned ? 'SUSPENDED' : 'ACTIVE';
        doc
          .fillColor(o.isBanned ? bannedColor : activeColor)
          .font('Helvetica-Bold');
        doc.text(statusText, cx + 5, y + 7, {
          width: colWidths[5] - 10,
          align: 'left',
        });
        doc.font('Helvetica');

        y += 22;
        count++;
      }

      // Add page numbers at the footer
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc
          .fillColor('#9CA3AF')
          .fontSize(8)
          .text(`Page ${i + 1} of ${range.count}`, 40, 800, {
            align: 'center',
            width: 515,
          });
      }

      doc.end();
    });
  }
}
