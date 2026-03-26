import { Module } from '@nestjs/common';
import { TurfsService } from './turfs.service';
import { TurfsController } from './turfs.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [PrismaModule, AuthModule, UploadModule],
  controllers: [TurfsController],
  providers: [TurfsService],
})
export class TurfsModule {}
