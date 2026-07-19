import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerSettlementsService } from './owner-settlements.service';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Owners')
@ApiBearerAuth('JWT-auth')
@Controller('api/v3/owner-settlements')
export class OwnerSettlementsController {
  constructor(
    private readonly ownerSettlementsService: OwnerSettlementsService,
  ) {}

  @Get('summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @ApiOperation({
    summary: 'Get owner settlements summary (revenue, settled, pending, bank)',
  })
  async getSummary(@Req() req: any) {
    return this.ownerSettlementsService.getSettlementsSummary(req.user.authId);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @ApiOperation({ summary: 'Get owner settlements history' })
  async getHistory(@Req() req: any) {
    return this.ownerSettlementsService.getSettlementsHistory(req.user.authId);
  }
}
