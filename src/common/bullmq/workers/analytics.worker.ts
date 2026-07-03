import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

@Processor('analytics')
export class AnalyticsWorker extends WorkerHost {
  private readonly logger = new Logger(AnalyticsWorker.name);

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing analytics job ${job.id} of type ${job.name}`);
    return { success: true };
  }
}
