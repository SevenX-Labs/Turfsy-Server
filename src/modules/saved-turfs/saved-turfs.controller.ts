import { Controller, Post, Delete, Get, Param, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { SavedTurfsService } from './saved-turfs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v3/saved-turfs')
@UseGuards(JwtAuthGuard)
export class SavedTurfsController {
  constructor(private readonly savedTurfsService: SavedTurfsService) {}

  @Post(':turfId')
  @HttpCode(HttpStatus.CREATED)
  async saveTurf(
    @Req() req: any,
    @Param('turfId') turfId: string,
    @Body('notes') notes?: string,
  ) {
    return this.savedTurfsService.saveTurf(req.user.authId, turfId, notes);
  }

  @Delete(':turfId')
  @HttpCode(HttpStatus.OK)
  async unsaveTurf(
    @Req() req: any,
    @Param('turfId') turfId: string,
  ) {
    return this.savedTurfsService.unsaveTurf(req.user.authId, turfId);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getSavedTurfs(@Req() req: any) {
    return this.savedTurfsService.getSavedTurfs(req.user.authId);
  }
}
