import { Module } from '@nestjs/common';
import { TurfsService } from './turfs.service';
import { TurfsController } from './turfs.controller';

@Module({
  controllers: [TurfsController],
  providers: [TurfsService],
})
export class TurfsModule {}
