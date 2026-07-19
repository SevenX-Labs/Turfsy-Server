import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SettlementStatus } from '@prisma/client';
import { Parser } from 'json2csv';
import * as pdfkit from 'pdfkit';

@Injectable()
export class AdminSettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async listSettlements(query: {
    status?: SettlementStatus;
    page?: number;
    limit?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }

    const [total, settlements] = await Promise.all([
      this.prisma.settlement.count({ where }),
      this.prisma.settlement.findMany({
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
        settlements,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getOwnerSettlements(ownerId: string) {
    const settlements = await this.prisma.settlement.findMany({
      where: { ownerProfileId: ownerId },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: settlements };
  }

  async createSettlement(dto: {
    ownerProfileId: string;
    amount: number;
    notes?: string;
    bookingCount?: number;
    period?: string;
  }) {
    const owner = await this.prisma.ownerProfile.findUnique({
      where: { id: dto.ownerProfileId },
    });
    if (!owner) throw new NotFoundException('Owner profile not found');

    const settlement = await this.prisma.settlement.create({
      data: {
        ownerProfileId: dto.ownerProfileId,
        amount: dto.amount,
        notes: dto.notes,
        bookingCount: dto.bookingCount,
        period: dto.period,
        status: 'PENDING',
      },
    });

    return { success: true, data: settlement };
  }

  async getSettlementDetails(id: string) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, name: true, contactNumber: true, email: true },
        },
      },
    });

    if (!settlement) throw new NotFoundException('Settlement not found');

    const actionLog = await this.prisma.adminActionLog.findFirst({
      where: {
        action: 'SETTLEMENT_PAID',
        targetId: id,
      },
      include: { admin: { select: { name: true, email: true } } },
    });

    return {
      success: true,
      data: {
        id: settlement.id,
        amount: settlement.amount,
        status: settlement.status,
        txRef: settlement.txRef,
        notes: settlement.notes,
        bookingCount: settlement.bookingCount,
        period: settlement.period,
        createdAt: settlement.createdAt,
        updatedAt: settlement.updatedAt,
        owner: settlement.owner,
        paidByAdmin: actionLog
          ? {
              name: actionLog.admin.name,
              email: actionLog.admin.email,
            }
          : null,
        paidTime: settlement.paidAt,
      },
    };
  }

  async markAsPaid(
    id: string,
    dto: { txRef: string; notes?: string },
    adminId: string,
    ipAddress: string,
  ) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id },
    });
    if (!settlement) throw new NotFoundException('Settlement record not found');

    const updated = await this.prisma.settlement.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        txRef: dto.txRef,
        notes: dto.notes || settlement.notes,
        paidAt: new Date(),
      },
    });

    await this.prisma.adminActionLog.create({
      data: {
        adminId,
        action: 'SETTLEMENT_PAID',
        targetType: 'Settlement',
        targetId: id,
        reason: `Settlement marked paid with txRef: ${dto.txRef}`,
        ipAddress,
      },
    });

    return { success: true, data: updated };
  }

  async exportSettlementsCsv(): Promise<string> {
    const settlements = await this.prisma.settlement.findMany({
      include: {
        owner: {
          select: { name: true, contactNumber: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = settlements.map((s) => ({
      id: s.id,
      ownerName: s.owner?.name || 'N/A',
      ownerEmail: s.owner?.email || 'N/A',
      amount: s.amount,
      status: s.status,
      txRef: s.txRef || 'N/A',
      bookingCount: s.bookingCount || 0,
      period: s.period || 'N/A',
      createdAt: s.createdAt,
    }));

    const fields = [
      { label: 'Settlement ID', value: 'id' },
      { label: 'Owner Name', value: 'ownerName' },
      { label: 'Owner Email', value: 'ownerEmail' },
      { label: 'Amount', value: 'amount' },
      { label: 'Status', value: 'status' },
      { label: 'Tx Ref', value: 'txRef' },
      { label: 'Bookings Count', value: 'bookingCount' },
      { label: 'Period', value: 'period' },
      { label: 'Created At', value: 'createdAt' },
    ];

    const json2csvParser = new Parser({ fields });
    return json2csvParser.parse(data);
  }

  async exportSettlementsPdf(): Promise<Buffer> {
    const settlements = await this.prisma.settlement.findMany({
      include: {
        owner: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return new Promise((resolve, reject) => {
      const doc = new ((pdfkit as any).default || (pdfkit as any))({
        margin: 50,
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('Turfsy Settlements Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, {
        align: 'right',
      });
      doc.moveDown();

      doc.fontSize(10).text('ID | Owner | Amount | Status | Tx Ref | Period', {
        underline: true,
      });
      doc.moveDown();

      for (const s of settlements) {
        doc
          .fontSize(9)
          .text(
            `${s.id.substring(0, 8)}... | ${s.owner?.name || 'N/A'} | Rs. ${s.amount} | ${s.status} | ${s.txRef || 'N/A'} | ${s.period || 'N/A'}`,
          );
        doc.moveDown(0.5);
      }

      doc.end();
    });
  }
}
