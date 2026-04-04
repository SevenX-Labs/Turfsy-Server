import { Controller } from '@nestjs/common';
import { UserGamificationService } from './user-gamification.service';

@Controller('user-gamification')
export class UserGamificationController {
  constructor(private readonly userGamificationService: UserGamificationService) {}
}
