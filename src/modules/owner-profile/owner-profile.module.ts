import { Module } from '@nestjs/common';
import { OwnerProfileService } from './owner-profile.service';
import { OwnerProfileController } from './owner-profile.controller';

@Module({
  controllers: [OwnerProfileController],
  providers: [OwnerProfileService],
})
export class OwnerProfileModule {}
