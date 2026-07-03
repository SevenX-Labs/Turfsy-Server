import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';

@Processor('notification')
export class NotificationWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationWorker.name);

  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(
      `Processing notification job ${job.id} of type ${job.name}`,
    );

    switch (job.name) {
      case 'send-push': {
        const { authId, title, body, data } = job.data;
        await this.notificationsService.sendNotification(
          authId,
          title,
          body,
          data,
        );
        break;
      }
      default:
        this.logger.warn(`Unknown notification job name: ${job.name}`);
    }

    return { success: true };
  }
}
