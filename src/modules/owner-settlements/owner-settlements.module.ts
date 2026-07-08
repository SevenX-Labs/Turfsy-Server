import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { OwnerSettlementsController } from './owner-settlements.controller';
import { OwnerSettlementsService } from './owner-settlements.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OwnerSettlementsController],
  providers: [OwnerSettlementsService],
  exports: [OwnerSettlementsService],
})
export class OwnerSettlementsModule {}
