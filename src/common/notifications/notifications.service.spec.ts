import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prismaService: PrismaService;
  let firebaseAdminService: FirebaseAdminService;

  const mockPrismaService = {
    fcmDevice: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    auth: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const mockFirebaseAdminService = {
    isReady: jest.fn().mockReturnValue(true),
    sendToToken: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-123' }),
    sendEachForMulticast: jest.fn().mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      successfulTokens: ['fcm-token-1'],
      failedTokens: [],
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('mock-value'),
          },
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: FirebaseAdminService,
          useValue: mockFirebaseAdminService,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prismaService = module.get<PrismaService>(PrismaService);
    firebaseAdminService = module.get<FirebaseAdminService>(FirebaseAdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should register a new FCM device token', async () => {
    mockPrismaService.fcmDevice.upsert.mockResolvedValue({
      id: 'device-1',
      authId: 'auth-1',
      fcmToken: 'fcm-token-123',
      platform: 'android',
      isActive: true,
    });

    const result = await service.registerDevice('auth-1', 'fcm-token-123', 'android', 'device-uuid-1');
    expect(result.success).toBe(true);
    expect(mockPrismaService.fcmDevice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          authId_fcmToken: {
            authId: 'auth-1',
            fcmToken: 'fcm-token-123',
          },
        },
      }),
    );
  });

  it('should send push notification to user active FCM devices', async () => {
    mockPrismaService.fcmDevice.findMany.mockResolvedValue([
      { fcmToken: 'fcm-token-1' },
      { fcmToken: 'fcm-token-2' },
    ]);
    mockPrismaService.notification.create.mockResolvedValue({ id: 'notif-1' });

    await service.sendNotification('auth-1', 'Goal!', 'Your team scored', { type: 'booking' });

    expect(mockPrismaService.fcmDevice.findMany).toHaveBeenCalledWith({
      where: { authId: 'auth-1', isActive: true },
      select: { fcmToken: true },
    });
    expect(mockFirebaseAdminService.sendEachForMulticast).toHaveBeenCalledWith(
      ['fcm-token-1', 'fcm-token-2'],
      expect.objectContaining({
        title: 'Goal!',
        body: 'Your team scored',
      }),
    );
    expect(mockPrismaService.notification.create).toHaveBeenCalled();
  });

  it('should deactivate invalid FCM tokens when multicast reports unregistration', async () => {
    mockPrismaService.fcmDevice.findMany.mockResolvedValue([
      { fcmToken: 'dead-token-1' },
    ]);
    mockFirebaseAdminService.sendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 1,
      successfulTokens: [],
      failedTokens: [
        { token: 'dead-token-1', error: 'Token not registered', isUnregistered: true },
      ],
    });
    mockPrismaService.notification.create.mockResolvedValue({ id: 'notif-1' });

    await service.sendNotification('auth-1', 'Reminder', 'Match in 1h');

    expect(mockPrismaService.fcmDevice.updateMany).toHaveBeenCalledWith({
      where: { fcmToken: { in: ['dead-token-1'] } },
      data: { isActive: false },
    });
  });
});
