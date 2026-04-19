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
   * Send a push notification using Expo API
   * @param token ExponentPushToken
   * @param title Title of notification
   * @param body Body content
   * @param data Optional data payload
   */
  async sendPush(token: string, title: string, body: string, data?: any) {
    if (!token) {
      this.logger.warn('Token is null, skipping push notification');
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
}

