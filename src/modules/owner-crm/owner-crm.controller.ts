import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { OwnerCrmService } from './owner-crm.service';
import { SendTurfOfferDto } from './dto/send-turf-offer.dto';
import { GetAudienceDto } from './dto/get-audience.dto';
import { BroadcastHistoryQueryDto } from './dto/broadcast-history-query.dto';
import { GetCustomersQueryDto } from './dto/get-customers-query.dto';

@ApiTags('Owner CRM')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
@Controller(['api/v1/owner/crm', 'api/v3/owner/crm'])
export class OwnerCrmController {
  constructor(private readonly ownerCrmService: OwnerCrmService) {}

  @Post('broadcast-offer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Broadcast promotional offer / announcement push notification to past customers',
    description:
      'Finds all unique customers who previously completed or confirmed bookings at the owner’s turf(s), filters by active notification settings, and sends target push notifications.',
  })
  @ApiResponse({
    status: 200,
    description: 'Offer notification successfully dispatched or enqueued',
    schema: {
      example: {
        success: true,
        broadcastId: '6b68a8dc-192e-4b2a-89ad-9382103810ef',
        recipientsCount: 42,
        enqueued: false,
        message: 'Offer broadcast successfully dispatched to 42 customers',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or 24-hour broadcast rate limit exceeded',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: Owner does not own the requested turf',
  })
  async broadcastOffer(@Req() req: any, @Body() dto: SendTurfOfferDto) {
    return this.ownerCrmService.broadcastOffer(req.user.authId, dto);
  }

  @Get('audience-count')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview eligible audience count for a turf before broadcasting',
    description:
      'Calculates the number of unique customers who will receive the broadcast, excluding users who disabled offer alerts.',
  })
  @ApiQuery({
    name: 'turfId',
    type: String,
    description: 'Specific turf ID or "ALL_MY_TURFS"',
    example: 'ALL_MY_TURFS',
  })
  @ApiResponse({
    status: 200,
    description: 'Eligible audience count preview',
    schema: {
      example: {
        success: true,
        turfId: 'ALL_MY_TURFS',
        targetTurfNames: ['Turfzy Arena Airoli', 'Turfzy Ground Vashi'],
        audienceCount: 128,
        totalPastBookings: 254,
      },
    },
  })
  async getAudienceCount(@Req() req: any, @Query() query: GetAudienceDto) {
    return this.ownerCrmService.getAudienceCount(req.user.authId, query.turfId);
  }

  @Get('broadcast-history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List past promotional broadcasts sent by this owner',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of previous broadcasts',
  })
  async getBroadcastHistory(
    @Req() req: any,
    @Query() query: BroadcastHistoryQueryDto,
  ) {
    return this.ownerCrmService.getBroadcastHistory(req.user.authId, query);
  }

  @Get('customers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List distinct past customers who booked owner turf(s) with contact details and booking stats',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of past customers with contact details and stats',
  })
  async getPastCustomers(
    @Req() req: any,
    @Query() query: GetCustomersQueryDto,
  ) {
    return this.ownerCrmService.getPastCustomers(req.user.authId, query);
  }
}

