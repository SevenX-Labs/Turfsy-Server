import { Test, TestingModule } from '@nestjs/testing';
import { UserProfileController } from './user-profile.controller';
import { UserProfileService } from './user-profile.service';
import { Gender } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const mockService = {
  createProfile: jest.fn(),
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  savePaymentDetails: jest.fn(),
  updateLocation: jest.fn(),
};

describe('UserProfileController', () => {
  let controller: UserProfileController;
  const req = { user: { authId: 'auth-1' } };

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [UserProfileController],
      providers: [{ provide: UserProfileService, useValue: mockService }],
    });

    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({
      canActivate: jest.fn().mockResolvedValue(true),
    });

    const module: TestingModule = await moduleBuilder.compile();
    controller = module.get<UserProfileController>(UserProfileController);
  });

  afterEach(() => jest.clearAllMocks());

  it('POST / — createProfile', async () => {
    mockService.createProfile.mockResolvedValue({ success: true });
    const dto = {
      name: 'Test',
      email: 'test@test.com',
      avatarUrl: '',
      dob: '1995-01-01',
      gender: Gender.MALE,
    };
    const result = await controller.createProfile(req, dto as any);
    expect(mockService.createProfile).toHaveBeenCalledWith('auth-1', dto);
    expect(result.success).toBe(true);
  });

  it('GET / — getProfile', async () => {
    mockService.getProfile.mockResolvedValue({ success: true, data: {} });
    const result = await controller.getProfile(req);
    expect(mockService.getProfile).toHaveBeenCalledWith('auth-1');
    expect(result.success).toBe(true);
  });

  it('PATCH / — updateProfile', async () => {
    mockService.updateProfile.mockResolvedValue({ success: true });
    const result = await controller.updateProfile(req, { name: 'Updated' });
    expect(mockService.updateProfile).toHaveBeenCalledWith('auth-1', {
      name: 'Updated',
    });
    expect(result.success).toBe(true);
  });

  it('POST /payment-details — savePaymentDetails', async () => {
    mockService.savePaymentDetails.mockResolvedValue({ success: true });
    const result = await controller.savePaymentDetails(req, {
      upiId: 'test@upi',
    });
    expect(mockService.savePaymentDetails).toHaveBeenCalledWith('auth-1', {
      upiId: 'test@upi',
    });
    expect(result.success).toBe(true);
  });

  it('POST /location — updateLocation', async () => {
    mockService.updateLocation.mockResolvedValue({ success: true });
    const result = await controller.updateLocation(req, {
      lat: 18.5,
      lng: 73.8,
      city: 'Pune',
    });
    expect(mockService.updateLocation).toHaveBeenCalledWith(
      'auth-1',
      18.5,
      73.8,
      'Pune',
    );
    expect(result.success).toBe(true);
  });
});
