import { Module } from '@nestjs/common';
import { UserGamificationService } from './user-gamification.service';
import { UserGamificationController } from './user-gamification.controller';

@Module({
  controllers: [UserGamificationController],
  providers: [UserGamificationService],
})
export class UserGamificationModule {}
