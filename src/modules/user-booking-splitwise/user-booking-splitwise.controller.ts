import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseInterceptors,
} from '@nestjs/common';
import { UserBookingSplitwiseService } from './user-booking-splitwise.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResponseSanitizerInterceptor } from '../../common/interceptors/response-sanitizer.interceptor';
import { AddPlayersDto } from './dto/add-players.dto';
import { UpdateSplitStatusDto } from './dto/update-status.dto';
import { SetAmountsDto } from './dto/set-amounts.dto';

@Controller('api/v3/booking')
@UseGuards(JwtAuthGuard)
@UseInterceptors(ResponseSanitizerInterceptor)
export class UserBookingSplitwiseController {
  constructor(
    private readonly splitwiseService: UserBookingSplitwiseService,
  ) {}

  @Post(':bookingId/split/players')
  @HttpCode(HttpStatus.OK)
  async addPlayers(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
    @Body() dto: AddPlayersDto,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.splitwiseService.addPlayers(req.user.authId, bookingId, dto, ip);
  }

  @Delete('split/players/:playerId')
  @HttpCode(HttpStatus.OK)
  async removePlayer(
    @Req() req: any,
    @Param('playerId', new ParseUUIDPipe({ version: '4' })) playerId: string,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.splitwiseService.removePlayer(req.user.authId, playerId, ip);
  }

  @Post(':bookingId/split/trigger')
  @HttpCode(HttpStatus.OK)
  async triggerSplit(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.splitwiseService.triggerSplit(req.user.authId, bookingId, ip);
  }

  @Patch('split/players/:playerId/status')
  @HttpCode(HttpStatus.OK)
  async updatePlayerStatus(
    @Req() req: any,
    @Param('playerId', new ParseUUIDPipe({ version: '4' })) playerId: string,
    @Body() dto: UpdateSplitStatusDto,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.splitwiseService.updatePlayerStatus(
      req.user.authId,
      playerId,
      dto.status,
      ip,
    );
  }

  @Patch(':bookingId/split/custom-amounts')
  @HttpCode(HttpStatus.OK)
  async setCustomAmounts(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
    @Body() dto: SetAmountsDto,
  ) {
    const ip = req.ip || req.connection?.remoteAddress;
    return this.splitwiseService.setCustomAmounts(
      req.user.authId,
      bookingId,
      dto,
      ip,
    );
  }

  @Get(':bookingId/split')
  @HttpCode(HttpStatus.OK)
  async getSplitDetails(
    @Req() req: any,
    @Param('bookingId', new ParseUUIDPipe({ version: '4' })) bookingId: string,
  ) {
    return this.splitwiseService.getSplitDetails(req.user.authId, bookingId);
  }
}
