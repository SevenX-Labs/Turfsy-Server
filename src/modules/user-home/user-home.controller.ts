import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { UserHomeService } from './user-home.service';
import { UserHomeResponseDto } from './dto/user-home-response.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { UserHomeQueryDto } from './dto/user-home-query.dto';

interface AuthenticatedRequest extends Request {
  user?: {
    authId: string;
  };
}

@Controller('api/v3/user-home')
export class UserHomeController {
  constructor(private readonly userHomeService: UserHomeService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  @HttpCode(HttpStatus.OK)
  async getHome(
    @Req() req: AuthenticatedRequest,
    @Query() query: UserHomeQueryDto,
  ): Promise<UserHomeResponseDto> {
    const lat = this.parseCoordinate(query.lat);
    const lng = this.parseCoordinate(query.lng);
    const city = query.city?.trim();

    return this.userHomeService.getHomeSections({
      authId: req.user?.authId,
      queryLat: lat,
      queryLng: lng,
      queryCity: city,
    });
  }

  private parseCoordinate(value?: string): number | undefined {
    if (!value) return undefined;
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) return undefined;
    return parsed;
  }
}
