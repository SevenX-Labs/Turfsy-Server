import { Module } from '@nestjs/common';
import { TurfsService } from './turfs.service';
import { TurfsController } from './turfs.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TurfsController],
  providers: [TurfsService],
})
export class TurfsModule {}
