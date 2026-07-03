import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Processor('booking')
export class BookingWorker extends WorkerHost {
  private readonly logger = new Logger(BookingWorker.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing booking job ${job.id} of type ${job.name}`);

    switch (job.name) {
      case 'send-confirmation-email': {
        // For now, we just log that we would send the email asynchronously
        // In a full implementation, we'd move the email sending logic here
        this.logger.log(
          `Would send confirmation email for booking: ${job.data.bookingId}`,
        );
        break;
      }
      case 'mark-no-shows': {
        this.logger.log(`Would mark no shows: ${JSON.stringify(job.data)}`);
        break;
      }
      default:
        this.logger.warn(`Unknown booking job name: ${job.name}`);
    }

    return { success: true };
  }
}
