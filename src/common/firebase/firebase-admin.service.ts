import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging, Message, MulticastMessage } from 'firebase-admin/messaging';

export interface FcmMessagePayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  channelId?: string;
  sound?: string;
}

export interface FcmSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isUnregistered?: boolean;
}

export interface FcmMulticastResult {
  successCount: number;
  failureCount: number;
  successfulTokens: string[];
  failedTokens: Array<{
    token: string;
    error: string;
    isUnregistered: boolean;
  }>;
}

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAdminService.name);
  private firebaseApp: App | null = null;
  private isConfigured = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      this.firebaseApp = existingApps[0]!;
      this.isConfigured = true;
      this.logger.log('Firebase Admin SDK already initialized. Reusing existing app instance.');
      return;
    }

    const projectId =
      this.configService.get<string>('FIREBASE_PROJECT_ID') ||
      process.env.FIREBASE_PROJECT_ID;
    const clientEmail =
      this.configService.get<string>('FIREBASE_CLIENT_EMAIL') ||
      process.env.FIREBASE_CLIENT_EMAIL;
    const rawPrivateKey =
      this.configService.get<string>('FIREBASE_PRIVATE_KEY') ||
      process.env.FIREBASE_PRIVATE_KEY;
    const serviceAccountJson =
      this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_KEY') ||
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    try {
      if (serviceAccountJson) {
        let parsed: any;
        try {
          parsed = JSON.parse(serviceAccountJson);
        } catch {
          // Might be base64 encoded
          const decoded = Buffer.from(serviceAccountJson, 'base64').toString('utf8');
          parsed = JSON.parse(decoded);
        }
        this.firebaseApp = initializeApp({
          credential: cert(parsed),
        });
        this.isConfigured = true;
        this.logger.log('Firebase Admin SDK initialized successfully via service account JSON.');
        return;
      }

      if (projectId && clientEmail && rawPrivateKey) {
        // Correctly handle escaped newlines in the private key string
        const privateKey = rawPrivateKey.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '');

        this.firebaseApp = initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        this.isConfigured = true;
        this.logger.log(
          `Firebase Admin SDK initialized successfully for project: ${projectId} (${clientEmail})`,
        );
        return;
      }

      this.logger.warn(
        'Firebase Admin credentials (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) not found in environment. FCM push notification dispatch will be skipped/mocked.',
      );
      this.isConfigured = false;
    } catch (error: any) {
      this.logger.error(`Failed to initialize Firebase Admin SDK: ${error.message}`, error.stack);
      this.isConfigured = false;
    }
  }

  public isReady(): boolean {
    return this.isConfigured && this.firebaseApp !== null;
  }

  private sanitizeDataMap(data?: Record<string, any>): Record<string, string> {
    if (!data) return {};
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        sanitized[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
    }
    return sanitized;
  }

  private isUnregisteredError(errorCode?: string, message?: string): boolean {
    if (!errorCode && !message) return false;
    const code = (errorCode || '').toLowerCase();
    const msg = (message || '').toLowerCase();
    return (
      code.includes('registration-token-not-registered') ||
      code.includes('invalid-registration-token') ||
      code.includes('invalid-argument') ||
      msg.includes('not registered') ||
      msg.includes('invalid registration token') ||
      msg.includes('requested entity was not found')
    );
  }

  /**
   * Send a single high-priority push notification to a device FCM token
   */
  async sendToToken(token: string, payload: FcmMessagePayload): Promise<FcmSendResult> {
    if (!token) {
      return { success: false, error: 'Token is empty' };
    }

    if (!this.isReady()) {
      this.logger.warn(
        `Firebase Admin not initialized. Skipping FCM dispatch to token: ${token.slice(0, 10)}...`,
      );
      return { success: false, error: 'Firebase Admin not initialized' };
    }

    const { title, body, data, channelId = 'default', sound = 'default' } = payload;
    const stringData = this.sanitizeDataMap(data);

    const message: Message = {
      token,
      notification: {
        title,
        body,
      },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          channelId,
          sound,
          priority: 'max',
          visibility: 'public',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
        },
        payload: {
          aps: {
            alert: {
              title,
              body,
            },
            sound,
            badge: 1,
          },
        },
      },
    };

    try {
      const messageId = await getMessaging(this.firebaseApp!).send(message);
      this.logger.log(`FCM notification sent successfully: ${messageId}`);
      return { success: true, messageId };
    } catch (error: any) {
      const errorCode = error.code || error.errorInfo?.code;
      const isUnregistered = this.isUnregisteredError(errorCode, error.message);

      this.logger.error(
        `FCM send error for token ${token.slice(0, 10)}...: [${errorCode || 'UNKNOWN'}] ${error.message}`,
      );

      return {
        success: false,
        error: error.message,
        isUnregistered,
      };
    }
  }

  /**
   * Batch multicast push notification to multiple FCM tokens (up to 500 per batch)
   */
  async sendEachForMulticast(
    tokens: string[],
    payload: FcmMessagePayload,
  ): Promise<FcmMulticastResult> {
    const validTokens = [...new Set(tokens.filter((t) => Boolean(t && typeof t === 'string')))];

    if (validTokens.length === 0) {
      return {
        successCount: 0,
        failureCount: 0,
        successfulTokens: [],
        failedTokens: [],
      };
    }

    if (!this.isReady()) {
      this.logger.warn(
        `Firebase Admin not initialized. Skipping multicast FCM dispatch to ${validTokens.length} tokens.`,
      );
      return {
        successCount: 0,
        failureCount: validTokens.length,
        successfulTokens: [],
        failedTokens: validTokens.map((t) => ({
          token: t,
          error: 'Firebase Admin not initialized',
          isUnregistered: false,
        })),
      };
    }

    const { title, body, data, channelId = 'default', sound = 'default' } = payload;
    const stringData = this.sanitizeDataMap(data);

    const result: FcmMulticastResult = {
      successCount: 0,
      failureCount: 0,
      successfulTokens: [],
      failedTokens: [],
    };

    // Firebase multicast batches support up to 500 tokens at a time
    const batchSize = 500;
    for (let i = 0; i < validTokens.length; i += batchSize) {
      const tokenBatch = validTokens.slice(i, i + batchSize);

      const multicastMessage: MulticastMessage = {
        tokens: tokenBatch,
        notification: {
          title,
          body,
        },
        data: stringData,
        android: {
          priority: 'high',
          notification: {
            channelId,
            sound,
            priority: 'max',
            visibility: 'public',
            defaultSound: true,
            defaultVibrateTimings: true,
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: {
                title,
                body,
              },
              sound,
              badge: 1,
            },
          },
        },
      };

      try {
        const response = await getMessaging(this.firebaseApp!).sendEachForMulticast(multicastMessage);

        result.successCount += response.successCount;
        result.failureCount += response.failureCount;

        response.responses.forEach((resp, idx) => {
          const currentToken = tokenBatch[idx];
          if (resp.success) {
            result.successfulTokens.push(currentToken);
          } else {
            const err = resp.error;
            const errorCode = err?.code || (err as any)?.errorInfo?.code;
            const isUnregistered = this.isUnregisteredError(errorCode, err?.message);

            result.failedTokens.push({
              token: currentToken,
              error: err?.message || 'Unknown multicast error',
              isUnregistered,
            });
          }
        });
      } catch (batchError: any) {
        this.logger.error(`FCM multicast batch failed: ${batchError.message}`, batchError.stack);
        result.failureCount += tokenBatch.length;
        tokenBatch.forEach((t) => {
          result.failedTokens.push({
            token: t,
            error: batchError.message,
            isUnregistered: false,
          });
        });
      }
    }

    this.logger.log(
      `FCM multicast completed: ${result.successCount} succeeded, ${result.failureCount} failed out of ${validTokens.length} devices`,
    );

    return result;
  }
}
