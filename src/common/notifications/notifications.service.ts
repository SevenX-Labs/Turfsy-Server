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
   * Fast batch multicast notification for sending to multiple users in bulk.
   * Partitions tokens into Expo and native FCM, dispatching each to its service.
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

    // Fetch all active devices for target users
    const devicesPromise = this.prisma.fcmDevice.findMany({
      where: {
        authId: { in: uniqueAuthIds },
        isActive: true,
      },
      select: { fcmToken: true },
    });

    const [_, devices] = await Promise.all([dbPromise, devicesPromise]);

    const allTokens = devices
      .map((d) => d.fcmToken)
      .filter((t): t is string => Boolean(t));

    // Partition tokens by type
    const expoTokens = allTokens.filter((t) => this.isExpoPushToken(t));
    const nativeFcmTokens = allTokens.filter((t) => !this.isExpoPushToken(t));

    const promises: Promise<any>[] = [];

    // Dispatch Expo tokens via Expo Push Service
    if (expoTokens.length > 0) {
      promises.push(
        this.dispatchExpoBatch(expoTokens, title, body, data).catch((err) =>
          this.logger.error(`Expo multicast dispatch error: ${err.message}`),
        ),
      );
    }

    // Dispatch native FCM tokens via Firebase Admin SDK
    if (nativeFcmTokens.length > 0) {
      promises.push(
        this.firebaseAdminService
          .sendEachForMulticast(nativeFcmTokens, {
            title,
            body,
            data: data || {},
          })
          .then(async (result) => {
            const unregistered = result.failedTokens
              .filter((f) => f.isUnregistered)
              .map((f) => f.token);
            if (unregistered.length > 0) {
              await this.handleInvalidTokens(unregistered);
            }
          })
          .catch((err) =>
            this.logger.error(`Native FCM multicast dispatch error: ${err.message}`),
          ),
      );
    }

    await Promise.allSettled(promises);
  }

  /**
   * Helper to identify if a token belongs to Expo Push Service
   */
  public isExpoPushToken(token: string): boolean {
    if (!token || typeof token !== 'string') return false;
    const trimmed = token.trim();
    return trimmed.startsWith('ExponentPushToken[') || trimmed.startsWith('expo.v2:');
  }

  /**
   * Send push notifications to multiple Expo push tokens via the Expo Push API.
   * Batches tokens in groups of 100 (Expo API limit per request).
   * Automatically deactivates tokens that Expo reports as DeviceNotRegistered.
   */
  public async dispatchExpoBatch(
    tokens: string[],
    title: string,
    body: string,
    data?: any,
  ): Promise<void> {
    const validTokens = [...new Set(tokens.filter((t) => this.isExpoPushToken(t)))];
    if (validTokens.length === 0) return;

    const expoAccessToken = this.configService.get<string>('EXPO_ACCESS_TOKEN');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    };
    if (expoAccessToken) {
      headers['Authorization'] = `Bearer ${expoAccessToken}`;
    }

    // Expo Push API accepts maximum 100 messages per request
    const batchSize = 100;
    for (let i = 0; i < validTokens.length; i += batchSize) {
      const batch = validTokens.slice(i, i + batchSize);
      const messages = batch.map((token) => ({
        to: token,
        title,
        body,
        sound: 'default' as const,
        priority: 'high' as const,
        channelId: 'default',
        _displayInForeground: true,
        data: data || {},
      }));

      try {
        const response = await axios.post(this.expoUrl, messages, {
          headers,
          httpsAgent: this.httpsAgent,
          timeout: 8000,
        });

        // Check tickets for unregistered tokens
        const tickets = response.data?.data || [];
        const unregisteredTokens: string[] = [];

        tickets.forEach((ticket: any, idx: number) => {
          if (ticket.status === 'error') {
            this.logger.warn(
              `Expo push error for token ${batch[idx]?.slice(0, 15)}...: ${ticket.message} (${ticket.details?.error})`,
            );
            if (ticket.details?.error === 'DeviceNotRegistered') {
              unregisteredTokens.push(batch[idx]);
            }
          }
        });

        if (unregisteredTokens.length > 0) {
          await this.handleInvalidTokens(unregisteredTokens);
        }

        this.logger.log(
          `Expo push batch dispatched: ${batch.length} tokens, ${unregisteredTokens.length} unregistered`,
        );
      } catch (error: any) {
        this.logger.error(`Failed to dispatch Expo push batch: ${error.message}`);
      }
    }
  }

  /**
   * Helper to dispatch push notification across all registered devices for a user.
   * Intelligently partitions tokens into Expo Push Tokens and native FCM tokens,
   * sending each batch to its dedicated push service.
   */
  private async dispatchPushToUser(
    authId: string,
    title: string,
    body: string,
    data?: any,
  ) {
    // 1. Query active devices from DB
    const devices = await this.prisma.fcmDevice.findMany({
      where: { authId, isActive: true },
      select: { fcmToken: true },
    });

    const tokenSet = new Set<string>(
      devices.map((d) => d.fcmToken.trim()).filter(Boolean),
    );

    // 2. Fallback check for Auth.expoPushToken (legacy field)
    const userAuth = await this.prisma.auth.findUnique({
      where: { id: authId },
      select: { expoPushToken: true },
    });

    if (userAuth?.expoPushToken) {
      tokenSet.add(userAuth.expoPushToken.trim());
    }

    const allTokens = Array.from(tokenSet);
    if (allTokens.length === 0) {
      this.logger.log(`No active push tokens for user ${authId}, saved to inbox only`);
      return;
    }

    // 3. Partition tokens by type
    const expoTokens: string[] = [];
    const nativeFcmTokens: string[] = [];

    for (const token of allTokens) {
      if (this.isExpoPushToken(token)) {
        expoTokens.push(token);
      } else {
        nativeFcmTokens.push(token);
      }
    }

    const promises: Promise<any>[] = [];

    // 4. Dispatch Expo push tokens via Expo Push Service
    if (expoTokens.length > 0) {
      promises.push(
        this.dispatchExpoBatch(expoTokens, title, body, data).catch((err) =>
          this.logger.error(`Expo dispatch error for user ${authId}: ${err.message}`),
        ),
      );
    }

    // 5. Dispatch native FCM tokens via Firebase Admin SDK
    if (nativeFcmTokens.length > 0) {
      promises.push(
        this.firebaseAdminService
          .sendEachForMulticast(nativeFcmTokens, {
            title,
            body,
            data: data || {},
          })
          .then(async (result) => {
            const unregistered = result.failedTokens
              .filter((f) => f.isUnregistered)
              .map((f) => f.token);
            if (unregistered.length > 0) {
              await this.handleInvalidTokens(unregistered);
            }
          })
          .catch((err) =>
            this.logger.error(`Native FCM dispatch error for user ${authId}: ${err.message}`),
          ),
      );
    }

    await Promise.allSettled(promises);
  }

  /**
   * Deactivate invalid/unregistered push tokens in the database
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
