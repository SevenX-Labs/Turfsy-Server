import { Module } from '@nestjs/common';
import { SavedTurfsService } from './saved-turfs.service';
import { SavedTurfsController } from './saved-turfs.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SavedTurfsController],
  providers: [SavedTurfsService],
})
export class SavedTurfsModule {}
