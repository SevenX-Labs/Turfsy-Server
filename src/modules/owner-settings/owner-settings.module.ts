import { Module } from '@nestjs/common';
import { OwnerSettingsService } from './owner-settings.service';
import { OwnerSettingsController } from './owner-settings.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OwnerSettingsController],
  providers: [OwnerSettingsService],
})
export class OwnerSettingsModule {}
