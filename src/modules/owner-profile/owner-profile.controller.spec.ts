import { Test, TestingModule } from '@nestjs/testing';
import { OwnerProfileController } from './owner-profile.controller';
import { OwnerProfileService } from './owner-profile.service';

describe('OwnerProfileController', () => {
  let controller: OwnerProfileController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OwnerProfileController],
      providers: [OwnerProfileService],
    }).compile();

    controller = module.get<OwnerProfileController>(OwnerProfileController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
