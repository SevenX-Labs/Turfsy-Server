import { Test, TestingModule } from '@nestjs/testing';
import { TurfsController } from './turfs.controller';
import { TurfsService } from './turfs.service';
import { UploadService } from '../upload/upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

const mockTurfsService = {
  createTurf: jest.fn(),
  getTurfDetails: jest.fn(),
  listAllTurfs: jest.fn(),
  getNearbyTurfs: jest.fn(),
  getMyTurfs: jest.fn(),
  searchTurfs: jest.fn(),
  filterTurfs: jest.fn(),
  updateTurf: jest.fn(),
  updateTurfStatus: jest.fn(),
};

const mockUploadService = {
  uploadTurfImage: jest.fn(),
};

describe('TurfsController', () => {
  let controller: TurfsController;

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      controllers: [TurfsController],
      providers: [
        { provide: TurfsService, useValue: mockTurfsService },
        { provide: UploadService, useValue: mockUploadService },
      ],
    });

    moduleBuilder.overrideGuard(JwtAuthGuard).useValue({
      canActivate: jest.fn().mockResolvedValue(true),
    });

    const module: TestingModule = await moduleBuilder.compile();

    controller = module.get<TurfsController>(TurfsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
