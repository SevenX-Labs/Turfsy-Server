import { Module } from '@nestjs/common';
import { SavedTurfsService } from './saved-turfs.service';
import { SavedTurfsController } from './saved-turfs.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SavedTurfsController],
  providers: [SavedTurfsService],
})
export class SavedTurfsModule {}
