import { Module } from '@nestjs/common';
import { PlatformFeeSlabService } from './platform-fee-slab.service';
import { PlatformFeeSlabController } from './platform-fee-slab.controller';

import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PlatformFeeSlabController],
  providers: [PlatformFeeSlabService],
  exports: [PlatformFeeSlabService],
})
export class PlatformFeeSlabModule {}
