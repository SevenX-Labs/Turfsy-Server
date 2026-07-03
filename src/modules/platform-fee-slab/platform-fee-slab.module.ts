import { Module } from '@nestjs/common';
import { PlatformFeeSlabService } from './platform-fee-slab.service';
import { PlatformFeeSlabController } from './platform-fee-slab.controller';

@Module({
  controllers: [PlatformFeeSlabController],
  providers: [PlatformFeeSlabService],
  exports: [PlatformFeeSlabService],
})
export class PlatformFeeSlabModule {}
