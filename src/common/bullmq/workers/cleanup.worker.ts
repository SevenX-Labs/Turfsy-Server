import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

@Processor('cleanup')
export class CleanupWorker extends WorkerHost {
  private readonly logger = new Logger(CleanupWorker.name);

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing cleanup job ${job.id} of type ${job.name}`);
    return { success: true };
  }
}
