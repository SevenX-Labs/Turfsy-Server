import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';
import * as https from 'https';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly expoUrl = 'https://exp.host/--/api/v2/push/send';
  private readonly httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 100,
    keepAliveMsecs: 15000,
  });

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Send a notification by saving it to DB and pushing via Expo if token exists
   * Ultra-fast non-blocking execution: dispatches push notification over persistent socket immediately
   */
  async sendNotification(
    authId: string,
    title: string,
    body: string,
    data?: any,
  ) {
    if (!authId) {
      this.logger.warn('AuthID is null, skipping notification');
      return;
    }

    // 1. Instant non-blocking Push Notification dispatch
    this.prisma.auth
      .findUnique({
        where: { id: authId },
        select: { expoPushToken: true },
      })
      .then((user) => {
        const token = user?.expoPushToken;
        if (token) {
          this.dispatchExpoPush(token, title, body, data);
        } else {
          this.logger.log(`No push token for user ${authId}, saved to inbox only`);
        }
      })
      .catch((e) =>
        this.logger.error(`Error fetching push token for ${authId}: ${e.message}`),
      );

    // 2. Parallel asynchronous DB inbox save
    this.prisma.notification
      .create({
        data: {
          authId,
          title,
          body,
          type: data?.type || null,
          data: data || {},
        },
      })
      .catch((e) => {
        this.logger.error(`Failed to save notification to DB: ${e.message}`);
      });
  }

  /**
   * Fast batch multicast notification for sending to multiple users in a single HTTP request
   */
  async sendMulticastNotification(
    authIds: string[],
    title: string,
    body: string,
    data?: any,
  ) {
    if (!authIds || authIds.length === 0) return;

    const uniqueAuthIds = [...new Set(authIds.filter(Boolean))];

    // Save DB notifications in bulk
    const dbPromise = this.prisma.notification
      .createMany({
        data: uniqueAuthIds.map((id) => ({
          authId: id,
          title,
          body,
          type: data?.type || null,
          data: data || {},
        })),
      })
      .catch((e) =>
        this.logger.error(`Failed to bulk save notifications to DB: ${e.message}`),
      );

    // Fetch tokens in parallel
    const tokensPromise = this.prisma.auth.findMany({
      where: {
        id: { in: uniqueAuthIds },
        expoPushToken: { not: null },
      },
      select: { expoPushToken: true },
    });

    const [_, users] = await Promise.all([dbPromise, tokensPromise]);

    const validTokens = users
      .map((u) => u.expoPushToken)
      .filter((t): t is string => Boolean(t));

    if (validTokens.length === 0) return;

    // Send single batch HTTP request to Expo (up to 100 messages per payload)
    const messages = validTokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default',
      priority: 'high',
      channelId: 'default',
      _displayInForeground: true,
      data: data || {},
    }));

    const expoAccessToken = this.configService.get<string>('EXPO_ACCESS_TOKEN');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (expoAccessToken) {
      headers['Authorization'] = `Bearer ${expoAccessToken}`;
    }

    try {
      await axios.post(this.expoUrl, messages, {
        headers,
        httpsAgent: this.httpsAgent,
        timeout: 4000,
      });
      this.logger.log(`Multicast push sent to ${validTokens.length} devices`);
    } catch (e: any) {
      this.logger.error(`Failed multicast push notification: ${e.message}`);
    }
  }

  /**
   * Helper to execute high-priority push notification dispatch over persistent connection
   */
  private async dispatchExpoPush(
    token: string,
    title: string,
    body: string,
    data?: any,
  ) {
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
          priority: 'high', // High priority for instant delivery (FCM high priority / APNs priority 10)
          channelId: 'default',
          _displayInForeground: true,
          data: data || {},
        },
        {
          headers,
          httpsAgent: this.httpsAgent,
          timeout: 4000, // Short 4s timeout prevents blocking
        },
      );

      const dataResponse = response.data?.data;
      if (Array.isArray(dataResponse)) {
        const ticket = dataResponse[0];
        if (ticket.status === 'error') {
          this.logger.error(
            `Expo push error for token ${token}: ${ticket.message}`,
          );
          if (ticket.details?.error === 'DeviceNotRegistered') {
            await this.handleInvalidToken(token);
          }
        } else {
          this.logger.log(`Push notification sent successfully to ${token}`);
        }
      } else if (response.data.errors) {
        this.logger.error(
          `Expo global errors: ${JSON.stringify(response.data.errors)}`,
        );
      }
    } catch (error: any) {
      this.logger.error(`Failed to send push notification: ${error.message}`);
      if (error.response?.data?.errors) {
        const errors = error.response.data.errors;
        for (const err of errors) {
          if (
            err.code === 'PUSH_TOKEN_INVALID' ||
            err.message?.includes('DeviceNotRegistered')
          ) {
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
    this.logger.warn(
      `DeviceNotRegistered for token: ${token}. Removing from DB.`,
    );
    try {
      await this.prisma.auth.updateMany({
        where: { expoPushToken: token },
        data: { expoPushToken: null },
      });
    } catch (dbError) {
      this.logger.error(
        `Failed to remove invalid token from DB: ${dbError.message}`,
      );
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
  async deleteNotification(authId: string, notificationId: string) {
    try {
      await this.prisma.notification.deleteMany({
        where: { id: notificationId, authId },
      });
      return { success: true, message: 'Notification deleted successfully' };
    } catch (e) {
      this.logger.error(`Failed to delete notification: ${e.message}`);
      return { success: false, message: 'Failed to delete notification' };
    }
  }

  async clearAll(authId: string) {
    try {
      await this.prisma.notification.deleteMany({
        where: { authId },
      });
      return { success: true, message: 'All notifications cleared' };
    } catch (e) {
      this.logger.error(`Failed to clear notifications: ${e.message}`);
      return { success: false, message: 'Failed to clear notifications' };
    }
  }
}
