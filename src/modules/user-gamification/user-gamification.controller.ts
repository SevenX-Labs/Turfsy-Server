import {
  Controller,
  Get,
  UseGuards,
  Req,
  Query,
  Post,
  Param,
} from '@nestjs/common';
import { UserGamificationService } from './user-gamification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('api/v3/user-gamification')
@UseGuards(JwtAuthGuard)
export class UserGamificationController {
  constructor(
    private readonly userGamificationService: UserGamificationService,
  ) {}

  @Get('overall')
  async getOverall(@Req() req: any) {
    return this.userGamificationService.getOverallStats(req.user.authId);
  }

  @Get('streak')
  async getStreak(@Req() req: any) {
    const stats = await this.userGamificationService.getUserStats(
      req.user.authId,
    );
    return { streak: stats?.streak || 0 };
  }

  @Get('nudge')
  async getNudge(@Req() req: any) {
    const message = await this.userGamificationService.getNudgeMessage(
      req.user.authId,
    );
    return { message };
  }

  @Get('leaderboard')
  async getLeaderboard(
    @Query('sortBy')
    sortBy: 'points' | 'totalMatches' | 'totalHours' = 'points',
  ) {
    return this.userGamificationService.getLeaderboardFiltered(sortBy);
  }

  @Get('leaderboard/points')
  async getLeaderboardPoints() {
    return this.userGamificationService.getLeaderboardFiltered('points');
  }

  @Get('leaderboard/total-matches-played')
  async getLeaderboardMatches() {
    return this.userGamificationService.getLeaderboardFiltered('totalMatches');
  }

  @Get('leaderboard/total-hours-played')
  async getLeaderboardHours() {
    return this.userGamificationService.getLeaderboardFiltered('totalHours');
  }
}
