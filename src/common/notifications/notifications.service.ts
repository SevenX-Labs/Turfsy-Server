import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import axios from 'axios';
import * as https from 'https';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly expoUrl = 'https://exp.host/--/api/v2/push/send';
  private readonly httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    keepAliveMsecs: 15000,
  });

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  /**
   * Register or update a client device FCM push token with multi-device support
   */
  async registerDevice(
    authId: string,
    token: string,
    platform: string = 'android',
    deviceId?: string,
  ) {
    if (!authId || !token) {
      throw new Error('User ID and token are required for device registration');
    }

    const trimmedToken = token.trim();
    const masked = `${trimmedToken.slice(0, 6)}...${trimmedToken.slice(-4)}`;

    try {
      // 1. If deviceId is provided, deactivate any previous tokens for the same physical device
      if (deviceId) {
        await this.prisma.fcmDevice.updateMany({
          where: {
            authId,
            deviceId,
            fcmToken: { not: trimmedToken },
            isActive: true,
          },
          data: { isActive: false },
        });
      }

      // 2. Upsert the device token record
      await this.prisma.fcmDevice.upsert({
        where: {
          authId_fcmToken: {
            authId,
            fcmToken: trimmedToken,
          },
        },
        create: {
          authId,
          fcmToken: trimmedToken,
          platform: platform || 'android',
          deviceId: deviceId || null,
          isActive: true,
          lastSeenAt: new Date(),
        },
        update: {
          isActive: true,
          platform: platform || 'android',
          deviceId: deviceId || null,
          lastSeenAt: new Date(),
        },
      });

      // 3. Keep Auth.expoPushToken updated for legacy compatibility if Expo format is passed
      if (trimmedToken.startsWith('ExponentPushToken[') || trimmedToken.startsWith('expo.v2:')) {
        await this.prisma.auth.update({
          where: { id: authId },
          data: { expoPushToken: trimmedToken },
        });
      }

      this.logger.log(`[FCM_REGISTERED] Registered device token [${masked}] for user ${authId} (${platform})`);
      return { success: true, message: 'Device token registered successfully' };
    } catch (error: any) {
      this.logger.error(`[FCM_REGISTER_ERROR] Failed to save device token for ${authId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send a notification by saving to DB inbox and pushing to all active FCM devices
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

    // 1. Instant Push Notification dispatch
    const pushPromise = this.dispatchPushToUser(authId, title, body, data).catch((e) =>
      this.logger.error(`Push dispatch error for ${authId}: ${e.message}`),
    );

    // 2. Parallel DB inbox save
    const dbPromise = this.prisma.notification
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

    await Promise.allSettled([pushPromise, dbPromise]);
  }

  /**
   * Fast batch multicast notification for sending to multiple users in bulk
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

    // Fetch all active FCM devices for target users
    const devicesPromise = this.prisma.fcmDevice.findMany({
      where: {
        authId: { in: uniqueAuthIds },
        isActive: true,
      },
      select: { fcmToken: true },
    });

    const [_, devices] = await Promise.all([dbPromise, devicesPromise]);

    const fcmTokens = devices
      .map((d) => d.fcmToken)
      .filter((t): t is string => Boolean(t));

    if (fcmTokens.length > 0) {
      const multicastResult = await this.firebaseAdminService.sendEachForMulticast(
        fcmTokens,
        {
          title,
          body,
          data: data || {},
        },
      );

      // Automatically deactivate any invalid/unregistered tokens
      const unregistered = multicastResult.failedTokens
        .filter((f) => f.isUnregistered)
        .map((f) => f.token);

      if (unregistered.length > 0) {
        await this.handleInvalidTokens(unregistered);
      }
    }
  }

  /**
   * Helper to dispatch push notification across all registered FCM devices for a user
   */
  private async dispatchPushToUser(
    authId: string,
    title: string,
    body: string,
    data?: any,
  ) {
    // 1. Query active FCM devices for this user
    const fcmDevices = await this.prisma.fcmDevice.findMany({
      where: { authId, isActive: true },
      select: { fcmToken: true },
    });

    const fcmTokens = fcmDevices
      .map((d) => d.fcmToken)
      .filter((t): t is string => Boolean(t));

    if (fcmTokens.length > 0) {
      // Send via Firebase Admin SDK
      const multicastResult = await this.firebaseAdminService.sendEachForMulticast(
        fcmTokens,
        {
          title,
          body,
          data: data || {},
        },
      );

      // Deactivate any tokens that Firebase identified as unregistered
      const unregistered = multicastResult.failedTokens
        .filter((f) => f.isUnregistered)
        .map((f) => f.token);

      if (unregistered.length > 0) {
        await this.handleInvalidTokens(unregistered);
      }
      return;
    }

    // 2. Fallback check for legacy Expo Push Token if no FCM devices registered yet
    const userAuth = await this.prisma.auth.findUnique({
      where: { id: authId },
      select: { expoPushToken: true },
    });

    const legacyToken = userAuth?.expoPushToken;
    if (legacyToken && (legacyToken.startsWith('ExponentPushToken[') || legacyToken.startsWith('expo.v2:'))) {
      this.logger.log(`Dispatching via fallback Expo push for user ${authId}`);
      await this.dispatchExpoFallback(legacyToken, title, body, data);
    } else {
      this.logger.log(`No active FCM push tokens for user ${authId}, saved to inbox only`);
    }
  }

  /**
   * Fallback for legacy Expo clients
   */
  private async dispatchExpoFallback(
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
      await axios.post(
        this.expoUrl,
        {
          to: token,
          title,
          body,
          sound: 'default',
          priority: 'high',
          channelId: 'default',
          _displayInForeground: true,
          data: data || {},
        },
        {
          headers,
          httpsAgent: this.httpsAgent,
          timeout: 4000,
        },
      );
    } catch (e: any) {
      this.logger.error(`Expo fallback error for ${token.slice(0, 12)}...: ${e.message}`);
    }
  }

  /**
   * Deactivate invalid/unregistered FCM tokens in the database
   */
  private async handleInvalidTokens(tokens: string[]) {
    if (!tokens || tokens.length === 0) return;

    this.logger.warn(`Deactivating ${tokens.length} invalid/unregistered FCM tokens in database`);
    try {
      await this.prisma.fcmDevice.updateMany({
        where: { fcmToken: { in: tokens } },
        data: { isActive: false },
      });
    } catch (dbError: any) {
      this.logger.error(`Failed to deactivate invalid tokens: ${dbError.message}`);
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
    } catch (e: any) {
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
    } catch (e: any) {
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
    } catch (e: any) {
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
    } catch (e: any) {
      this.logger.error(`Failed to clear notifications: ${e.message}`);
      return { success: false, message: 'Failed to clear notifications' };
    }
  }
}
