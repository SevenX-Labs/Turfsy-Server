import { Injectable } from '@nestjs/common';

export interface PaymentLogEntry {
  userId: string;
  bookingId: string;
  turfId?: string;
  action:
    | 'create-order'
    | 'confirm'
    | 'failed'
    | 'cancel'
    | 'refund'
    | 'verify-pin'
    | 'create-booking'
    | 'complete'
    | 'rate';
  amount?: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  ip?: string;
  userAgent?: string;
  result: 'SUCCESS' | 'FAILED' | 'REJECTED';
  rejectionReason?: string;
}

@Injectable()
export class PaymentLoggerService {
  /**
   * Mask razorpay payment ID: pay_***last4
   */
  private maskPaymentId(paymentId?: string): string {
    if (!paymentId) return 'N/A';
    if (paymentId.length <= 8) return 'pay_***';
    return `pay_***${paymentId.slice(-4)}`;
  }

  /**
   * Log a payment event securely — server-side only.
   */
  log(entry: PaymentLogEntry): void {
    const timestamp = new Date().toISOString();
    const maskedPaymentId = this.maskPaymentId(entry.razorpayPaymentId);

    const logData = {
      timestamp,
      userId: entry.userId,
      bookingId: entry.bookingId,
      turfId: entry.turfId || 'N/A',
      action: entry.action,
      amount: entry.amount ?? 'N/A',
      razorpayOrderId: entry.razorpayOrderId || 'N/A',
      razorpayPaymentId: maskedPaymentId,
      ip: entry.ip || 'N/A',
      userAgent: entry.userAgent || 'N/A',
      result: entry.result,
      rejectionReason: entry.rejectionReason || undefined,
    };

    if (entry.result === 'SUCCESS') {
      console.log(`[PAYMENT] ${JSON.stringify(logData)}`);
    } else {
      console.warn(`[PAYMENT-${entry.result}] ${JSON.stringify(logData)}`);
    }
  }

  /**
   * Alert on critical security events
   */
  alert(message: string, details: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    console.error(
      `[SECURITY ALERT] ${timestamp} | ${message} | ${JSON.stringify(details)}`,
    );
  }
}
