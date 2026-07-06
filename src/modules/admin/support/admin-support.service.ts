import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TicketStatus, TicketPriority } from '@prisma/client';

@Injectable()
export class AdminSupportService {
  constructor(private readonly prisma: PrismaService) {}

  async listTickets(query: { status?: TicketStatus; priority?: TicketPriority; page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;

    const [total, tickets] = await Promise.all([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          replies: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        tickets,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getTicket(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        replies: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return { success: true, data: ticket };
  }

  async assignTicket(id: string, assignToAdminId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        assignedTo: assignToAdminId,
        status: 'IN_PROGRESS',
      },
    });

    return { success: true, data: updated };
  }

  async replyToTicket(id: string, message: string, adminId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    // Create reply
    const reply = await this.prisma.supportTicketReply.create({
      data: {
        ticketId: id,
        senderId: adminId,
        senderType: 'ADMIN',
        message,
      },
    });

    // Update status to IN_PROGRESS if it was OPEN
    let newStatus = ticket.status;
    if (ticket.status === 'OPEN') {
      newStatus = 'IN_PROGRESS';
      await this.prisma.supportTicket.update({
        where: { id },
        data: { status: 'IN_PROGRESS' },
      });
    }

    return { success: true, data: { reply, status: newStatus } };
  }

  async resolveTicket(id: string, adminId: string, ipAddress: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    });

    await this.prisma.adminActionLog.create({
      data: {
        adminId,
        action: 'SUPPORT_TICKET_RESOLVED',
        targetType: 'SupportTicket',
        targetId: id,
        reason: 'Marked resolved by admin',
        ipAddress,
      },
    });

    return { success: true, data: updated };
  }

  async closeTicket(id: string, adminId: string, ipAddress: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });

    await this.prisma.adminActionLog.create({
      data: {
        adminId,
        action: 'SUPPORT_TICKET_RESOLVED', // using existing role log action
        targetType: 'SupportTicket',
        targetId: id,
        reason: 'Marked closed by admin',
        ipAddress,
      },
    });

    return { success: true, data: updated };
  }
}
