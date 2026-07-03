import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { BookingService } from '../../../modules/booking/booking.service';
import { PaymentLoggerService } from '../../services/payment-logger.service';

@Processor('payment-retry')
export class PaymentRetryWorker extends WorkerHost {
  private readonly logger = new Logger(PaymentRetryWorker.name);

  constructor(
    private readonly bookingService: BookingService,
    private readonly paymentLogger: PaymentLoggerService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { bookingId, paymentId, orderId } = job.data;
    this.logger.log(
      `Processing payment-retry job ${job.id} for booking ${bookingId}`,
    );

    // Delegate reconciliation to BookingService
    await this.bookingService.reconcilePayment(bookingId, paymentId, orderId);

    return { success: true };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<any, any, string>, error: Error) {
    const maxAttempts = job.opts.attempts || 5;
    if (job.attemptsMade >= maxAttempts) {
      const { bookingId, paymentId, orderId } = job.data;
      this.logger.error(
        `[DEAD-LETTER] Payment reconciliation permanently failed for booking ${bookingId} after ${job.attemptsMade} attempts. Error: ${error.message}. Requires manual admin intervention.`,
      );

      // Log to secure payment logger alert system
      this.paymentLogger.alert('Payment retry exhausted - DEAD LETTER', {
        bookingId,
        paymentId,
        orderId,
        attemptsMade: job.attemptsMade,
        error: error.message,
      });
    }
  }
}
