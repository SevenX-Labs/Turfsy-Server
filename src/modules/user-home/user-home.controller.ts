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
import { UserHomeSectionResponseDto } from './dto/user-home-section-response.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { UserHomeQueryDto } from './dto/user-home-query.dto';
import { HomeSectionType } from './types/home-section.enum';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

interface AuthenticatedRequest extends Request {
  user?: {
    authId: string;
  };
}

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
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
    return this.userHomeService.getHomeSections(
      this.buildUserOptions(req, query),
    );
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('top-recommended')
  @HttpCode(HttpStatus.OK)
  async getTopRecommended(
    @Req() req: AuthenticatedRequest,
    @Query() query: UserHomeQueryDto,
  ): Promise<UserHomeSectionResponseDto> {
    return this.userHomeService.getSection(
      HomeSectionType.TOP_RECOMMENDED,
      this.buildUserOptions(req, query),
    );
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('most-rated')
  @HttpCode(HttpStatus.OK)
  async getMostRated(
    @Req() req: AuthenticatedRequest,
    @Query() query: UserHomeQueryDto,
  ): Promise<UserHomeSectionResponseDto> {
    return this.userHomeService.getSection(
      HomeSectionType.MOST_RATED,
      this.buildUserOptions(req, query),
    );
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('budget-friendly')
  @HttpCode(HttpStatus.OK)
  async getBudgetFriendly(
    @Req() req: AuthenticatedRequest,
    @Query() query: UserHomeQueryDto,
  ): Promise<UserHomeSectionResponseDto> {
    return this.userHomeService.getSection(
      HomeSectionType.BUDGET_FRIENDLY,
      this.buildUserOptions(req, query),
    );
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('nearby')
  @HttpCode(HttpStatus.OK)
  async getNearby(
    @Req() req: AuthenticatedRequest,
    @Query() query: UserHomeQueryDto,
  ): Promise<UserHomeSectionResponseDto> {
    return this.userHomeService.getSection(
      HomeSectionType.NEARBY,
      this.buildUserOptions(req, query),
    );
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('most-demanded')
  @HttpCode(HttpStatus.OK)
  async getMostDemanded(
    @Req() req: AuthenticatedRequest,
    @Query() query: UserHomeQueryDto,
  ): Promise<UserHomeSectionResponseDto> {
    return this.userHomeService.getSection(
      HomeSectionType.MOST_DEMANDED,
      this.buildUserOptions(req, query),
    );
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('newly-opened')
  @HttpCode(HttpStatus.OK)
  async getNewlyOpened(
    @Req() req: AuthenticatedRequest,
    @Query() query: UserHomeQueryDto,
  ): Promise<UserHomeSectionResponseDto> {
    return this.userHomeService.getSection(
      HomeSectionType.NEWLY_OPENED,
      this.buildUserOptions(req, query),
    );
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('recently-viewed')
  @HttpCode(HttpStatus.OK)
  async getRecentlyViewed(
    @Req() req: AuthenticatedRequest,
    @Query() query: UserHomeQueryDto,
  ): Promise<UserHomeSectionResponseDto> {
    return this.userHomeService.getSection(
      HomeSectionType.RECENTLY_VIEWED,
      this.buildUserOptions(req, query),
    );
  }

  private buildUserOptions(req: AuthenticatedRequest, query: UserHomeQueryDto) {
    const lat = this.parseCoordinate(query.lat);
    const lng = this.parseCoordinate(query.lng);
    const city = query.city?.trim();
    const radius = this.parseRadius(query.radiusKm);

    return {
      authId: req.user?.authId,
      queryLat: lat,
      queryLng: lng,
      queryCity: city,
      queryRadiusKm: radius,
      refresh: query.refresh === 'true',
    };
  }

  private parseCoordinate(value?: string): number | undefined {
    if (!value) return undefined;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  private parseRadius(value?: string): number | undefined {
    if (!value) return undefined;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
}
