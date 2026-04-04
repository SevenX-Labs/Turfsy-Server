import { Module } from '@nestjs/common';
import { UserGamificationService } from './user-gamification.service';
import { UserGamificationController } from './user-gamification.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UserGamificationController],
  providers: [UserGamificationService],
  exports: [UserGamificationService],
})
export class UserGamificationModule {}
