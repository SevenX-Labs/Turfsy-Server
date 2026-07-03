import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EmailService } from '../../email/email.service';

@Processor('email')
export class EmailWorker extends WorkerHost {
  private readonly logger = new Logger(EmailWorker.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing email job ${job.id} of type ${job.name}`);

    switch (job.name) {
      case 'send-booking-confirmation': {
        const { email, bookingData } = job.data;
        await this.emailService.sendBookingConfirmation(email, bookingData);
        break;
      }
      case 'send-booking-cancellation': {
        const { email, bookingData } = job.data;
        await this.emailService.sendBookingCancellation(email, bookingData);
        break;
      }
      case 'send-payment-pending': {
        const { email, bookingData } = job.data;
        await this.emailService.sendPaymentPending(email, bookingData);
        break;
      }
      case 'send-no-show-notice': {
        const { email, bookingData } = job.data;
        await this.emailService.sendNoShowNotice(email, bookingData);
        break;
      }
      default:
        this.logger.warn(`Unknown email job name: ${job.name}`);
    }

    return { success: true };
  }
}
