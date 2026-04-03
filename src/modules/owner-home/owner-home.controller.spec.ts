import { Test, TestingModule } from '@nestjs/testing';
import { OwnerHomeController } from './owner-home.controller';
import { OwnerHomeService } from './owner-home.service';

describe('OwnerHomeController', () => {
  let controller: OwnerHomeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OwnerHomeController],
      providers: [OwnerHomeService],
    }).compile();

    controller = module.get<OwnerHomeController>(OwnerHomeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
