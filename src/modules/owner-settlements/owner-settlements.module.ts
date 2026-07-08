import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { OwnerSettlementsController } from './owner-settlements.controller';
import { OwnerSettlementsService } from './owner-settlements.service';

@Module({
  imports: [PrismaModule],
  controllers: [OwnerSettlementsController],
  providers: [OwnerSettlementsService],
  exports: [OwnerSettlementsService],
})
export class OwnerSettlementsModule {}
