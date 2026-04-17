import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CacheService } from '../common/services/cache.service';

@Global()
@Module({
  providers: [PrismaService, CacheService],
  exports: [PrismaService, CacheService],
})
export class PrismaModule {}
