import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly expoUrl = 'https://exp.host/--/api/v2/push/send';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Send a notification by saving it to DB and pushing via Expo if token exists
   * @param authId Auth ID of the user
   * @param title Title of notification
   * @param body Body content
   * @param data Optional data payload
   */
  async sendNotification(authId: string, title: string, body: string, data?: any) {
    if (!authId) {
      this.logger.warn('AuthID is null, skipping notification');
      return;
    }

    try {
      await this.prisma.notification.create({
        data: {
          authId,
          title,
          body,
          type: data?.type || null,
          data: data || {},
        },
      });
    } catch (e) {
      this.logger.error(`Failed to save notification to DB: ${e.message}`);
    }

    const user = await this.prisma.auth.findUnique({
      where: { id: authId },
      select: { expoPushToken: true },
    });

    const token = user?.expoPushToken;

    if (!token) {
      this.logger.log(`No push token for user ${authId}, saved to inbox only`);
      return;
    }

    const expoAccessToken = this.configService.get<string>('EXPO_ACCESS_TOKEN');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (expoAccessToken) {
      headers['Authorization'] = `Bearer ${expoAccessToken}`;
    }

    try {
      const response = await axios.post(
        this.expoUrl,
        {
          to: token,
          title,
          body,
          sound: 'default',
          data: data || {},
        },
        { headers },
      );

      const dataResponse = response.data?.data;
      if (Array.isArray(dataResponse)) {
        const ticket = dataResponse[0];
        if (ticket.status === 'error') {
          this.logger.error(`Expo push error for token ${token}: ${ticket.message}`);
          if (ticket.details?.error === 'DeviceNotRegistered') {
            await this.handleInvalidToken(token);
          }
        } else {
          this.logger.log(`Push notification sent successfully to ${token}`);
        }
      } else if (response.data.errors) {
        this.logger.error(`Expo global errors: ${JSON.stringify(response.data.errors)}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send push notification: ${error.message}`);
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors;
        for (const err of errors) {
          if (err.code === 'PUSH_TOKEN_INVALID' || err.message?.includes('DeviceNotRegistered')) {
            await this.handleInvalidToken(token);
          }
        }
      }
    }
  }

  /**
   * Handle invalid tokens by removing them from DB
   * @param token The invalid ExponentPushToken
   */
  private async handleInvalidToken(token: string) {
    this.logger.warn(`DeviceNotRegistered for token: ${token}. Removing from DB.`);
    try {
      await this.prisma.auth.updateMany({
        where: { expoPushToken: token },
        data: { expoPushToken: null },
      });
    } catch (dbError) {
      this.logger.error(`Failed to remove invalid token from DB: ${dbError.message}`);
    }
  }

  async getInbox(authId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { authId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { authId } }),
    ]);

    const unreadCount = await this.prisma.notification.count({
      where: { authId, isRead: false },
    });

    return {
      success: true,
      data: notifications,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    };
  }

  async markAsRead(authId: string, notificationId: string) {
    try {
      await this.prisma.notification.updateMany({
        where: { id: notificationId, authId },
        data: { isRead: true },
      });
      return { success: true, message: 'Notification marked as read' };
    } catch (e) {
      this.logger.error(`Failed to mark read: ${e.message}`);
      return { success: false, message: 'Failed to mark as read' };
    }
  }

  async markAllAsRead(authId: string) {
    try {
      await this.prisma.notification.updateMany({
        where: { authId, isRead: false },
        data: { isRead: true },
      });
      return { success: true, message: 'All notifications marked as read' };
    } catch (e) {
      this.logger.error(`Failed to mark all as read: ${e.message}`);
      return { success: false, message: 'Failed' };
    }
  }
}

