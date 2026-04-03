import { Module } from '@nestjs/common';
import { OwnerHomeService } from './owner-home.service';
import { OwnerHomeController } from './owner-home.controller';

import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OwnerHomeController],
  providers: [OwnerHomeService],
})
export class OwnerHomeModule {}
