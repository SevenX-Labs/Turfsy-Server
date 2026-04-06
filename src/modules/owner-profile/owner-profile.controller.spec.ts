import { Test, TestingModule } from '@nestjs/testing';
import { OwnerProfileController } from './owner-profile.controller';
import { OwnerProfileService } from './owner-profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const mockOwnerProfileService = {
  createProfile: jest.fn(),
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  savePaymentDetails: jest.fn(),
};

describe('OwnerProfileController', () => {
  let controller: OwnerProfileController;

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [OwnerProfileController],
      providers: [
        { provide: OwnerProfileService, useValue: mockOwnerProfileService },
      ],
    });

    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({
      canActivate: jest.fn().mockResolvedValue(true),
    });

    const module: TestingModule = await moduleBuilder.compile();

    controller = module.get<OwnerProfileController>(OwnerProfileController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
