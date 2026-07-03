import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { BookingService } from '../../../modules/booking/booking.service';

@Processor('booking-expiry')
export class BookingExpiryWorker extends WorkerHost {
  private readonly logger = new Logger(BookingExpiryWorker.name);

  constructor(private readonly bookingService: BookingService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { bookingId } = job.data;
    this.logger.log(
      `Processing booking-expiry job ${job.id} for bookingId ${bookingId}`,
    );

    if (job.name === 'expire-booking') {
      await this.bookingService.handleBookingExpiration(bookingId);
    } else {
      this.logger.warn(`Unknown job name ${job.name} in booking-expiry worker`);
    }

    return { success: true };
  }
}
