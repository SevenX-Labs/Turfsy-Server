import { Test, TestingModule } from '@nestjs/testing';
import { OwnerSettingsController } from './owner-settings.controller';
import { OwnerSettingsService } from './owner-settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';

describe('OwnerSettingsController', () => {
  let controller: OwnerSettingsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OwnerSettingsController],
      providers: [
        {
          provide: OwnerSettingsService,
          useValue: {
            getProfileSettings: jest.fn(),
            updateProfileSettings: jest.fn(),
            getTurfSettings: jest.fn(),
            updateTurfSettings: jest.fn(),
            getPaymentSettings: jest.fn(),
            updatePaymentSettings: jest.fn(),
            getNotificationSettings: jest.fn(),
            updateNotificationSettings: jest.fn(),
            getCancellationPolicy: jest.fn(),
            updateCancellationPolicy: jest.fn(),
            changePassword: jest.fn(),
            getSupportInfo: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            logout: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<OwnerSettingsController>(OwnerSettingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
