import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OwnerSettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettlementsSummary(ownerAuthId: string) {
    const owner = await this.prisma.ownerProfile.findUnique({
      where: { authId: ownerAuthId },
      include: {
        turfs: { select: { id: true } },
        payment: true,
      },
    });
    if (!owner) {
      throw new NotFoundException('Owner profile not found');
    }

    const turfIds = owner.turfs.map((t) => t.id);

    // Fetch all completed bookings for the owner's turfs
    const completedBookings = await this.prisma.booking.findMany({
      where: {
        turfId: { in: turfIds },
        bookingStatus: 'COMPLETED',
      },
      select: {
        amount: true,
        depositAmount: true,
        platformFee: true,
      },
    });

    // Total revenue = Sum of booking.amount for completed bookings
    const totalRevenue = completedBookings.reduce(
      (sum, b) => sum + b.amount,
      0,
    );

    // Total owed = Sum of depositAmount for completed bookings
    const totalOwed = completedBookings.reduce(
      (sum, b) => sum + b.depositAmount,
      0,
    );

    // Fetch all settlements for this owner
    const settlements = await this.prisma.settlement.findMany({
      where: { ownerProfileId: owner.id },
      select: { amount: true },
    });

    const totalSettled = settlements.reduce((sum, s) => sum + s.amount, 0);

    // Pending Settlements = totalOwed - totalSettled
    const pendingSettlements = Math.max(0, totalOwed - totalSettled);

    return {
      success: true,
      data: {
        totalRevenue,
        totalOwed,
        totalSettled,
        pendingSettlements,
        bankDetails: owner.payment
          ? {
              bankHolderName: owner.payment.bankHolderName ?? null,
              bankName: owner.payment.bankName ?? null,
              accountNumber: owner.payment.accountNumber
                ? `*${owner.payment.accountNumber.slice(-4)}`
                : null,
              ifscCode: owner.payment.ifscCode ?? null,
              upiId: owner.payment.upiId ?? null,
              payoutMethod: owner.payment.payoutMethod ?? null,
            }
          : null,
      },
    };
  }

  async getSettlementsHistory(ownerAuthId: string) {
    const owner = await this.prisma.ownerProfile.findUnique({
      where: { authId: ownerAuthId },
    });
    if (!owner) {
      throw new NotFoundException('Owner profile not found');
    }

    const settlements = await this.prisma.settlement.findMany({
      where: { ownerProfileId: owner.id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: settlements,
    };
  }
}
