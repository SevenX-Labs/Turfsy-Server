import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Parser } from 'json2csv';
import * as pdfkit from 'pdfkit';

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(query: {
    search?: string;
    status?: 'active' | 'suspended' | 'deleted';
    page?: number;
    limit?: number;
  }) {
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
        {
          userProfile: {
            name: { contains: query.search, mode: 'insensitive' },
          },
        },
        {
          userProfile: {
            email: { contains: query.search, mode: 'insensitive' },
          },
        },
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
    if (!user || user.role !== 'USER')
      throw new NotFoundException('User not found');

    const bookings = await this.prisma.booking.findMany({
      where: { userId: id },
      select: { amount: true, bookingStatus: true },
    });

    const totalBookings = bookings.length;
    const totalSpent = bookings
      .filter(
        (b) =>
          b.bookingStatus === 'COMPLETED' || b.bookingStatus === 'CONFIRMED',
      )
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

  async suspendUser(
    id: string,
    reason: string,
    adminId: string,
    ipAddress: string,
  ) {
    const user = await this.prisma.auth.findFirst({
      where: { id, role: 'USER' },
    });
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
    const user = await this.prisma.auth.findFirst({
      where: { id, role: 'USER' },
    });
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
    const user = await this.prisma.auth.findFirst({
      where: { id, role: 'USER', deletedAt: null },
    });
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
        .text('Users Directory Directory & Account Audit', 55, 74);

      // Date meta info
      doc
        .fontSize(8)
        .font('Helvetica')
        .text(`Generated: ${new Date().toLocaleString()}`, 380, 55, {
          align: 'right',
          width: 160,
        });
      doc.text(`Total Records: ${users.length}`, 380, 72, {
        align: 'right',
        width: 160,
      });

      // Table Setup
      let y = 120;
      const headers = ['#', 'Name', 'Phone', 'Email', 'City', 'Status'];
      const colWidths = [25, 110, 85, 170, 75, 50];
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

      for (const u of users) {
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
          .text(u.userProfile?.name || 'N/A', cx + 5, y + 7, {
            width: colWidths[1] - 10,
            ellipsis: true,
          });
        doc.font('Helvetica');
        cx += colWidths[1];

        // Phone
        doc.text(u.phone || 'N/A', cx + 5, y + 7, {
          width: colWidths[2] - 10,
          ellipsis: true,
        });
        cx += colWidths[2];

        // Email
        doc.text(u.userProfile?.email || 'N/A', cx + 5, y + 7, {
          width: colWidths[3] - 10,
          ellipsis: true,
        });
        cx += colWidths[3];

        // City
        doc.text(u.userProfile?.city || 'N/A', cx + 5, y + 7, {
          width: colWidths[4] - 10,
          ellipsis: true,
        });
        cx += colWidths[4];

        // Status
        const statusText = u.isBanned ? 'BANNED' : 'ACTIVE';
        doc
          .fillColor(u.isBanned ? bannedColor : activeColor)
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
