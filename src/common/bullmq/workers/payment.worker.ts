import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

@Processor('payment')
export class PaymentWorker extends WorkerHost {
  private readonly logger = new Logger(PaymentWorker.name);

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing payment job ${job.id} of type ${job.name}`);
    return { success: true };
  }
}
