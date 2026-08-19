import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SaveTokenDto } from './dto/save-token.dto';

@ApiTags('Notifications')
@ApiBearerAuth('JWT-auth')
@Controller('api/v3/notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('save-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register or refresh client device FCM push token' })
  @ApiResponse({ status: 200, description: 'Token registered successfully' })
  async saveToken(@Req() req: any, @Body() body: SaveTokenDto) {
    const { authId } = req.user;
    const token = (body.token || body.fcmToken || body.expoPushToken || '').trim();

    if (!token) {
      throw new BadRequestException('Push registration token is required');
    }

    if (token.length < 5 || token.length > 4096) {
      throw new BadRequestException('Invalid push registration token length');
    }

    const platform = (body.platform || 'android').toLowerCase();
    const deviceId = body.deviceId?.trim() || undefined;

    return this.notificationsService.registerDevice(
      authId,
      token,
      platform,
      deviceId,
    );
  }

  @Get('test')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send test push notification to the authenticated user' })
  async testNotification(@Req() req: any) {
    const { authId } = req.user;

    const deviceCount = await this.prisma.fcmDevice.count({
      where: { authId, isActive: true },
    });

    const user = await this.prisma.auth.findUnique({
      where: { id: authId },
      select: { expoPushToken: true },
    });

    if (deviceCount === 0 && !user?.expoPushToken) {
      return { success: false, message: 'No registered push devices found for user' };
    }

    await this.notificationsService.sendNotification(
      authId,
      'Turfzy Match Alert',
      'This is a test notification from your Turfzy app.',
      { type: 'test', timestamp: new Date().toISOString() },
    );

    return {
      success: true,
      message: `Test notification dispatched to ${deviceCount > 0 ? `${deviceCount} FCM device(s)` : 'legacy push device'}`,
    };
  }

  @Get('inbox')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getInbox(
    @Req() req: any,
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 20;
    return this.notificationsService.getInbox(
      req.user.authId,
      pageNumber,
      limitNumber,
    );
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async markAsRead(@Req() req: any, @Param('id') notificationId: string) {
    return this.notificationsService.markAsRead(
      req.user.authId,
      notificationId,
    );
  }

  @Patch('read-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@Req() req: any) {
    return this.notificationsService.markAllAsRead(req.user.authId);
  }

  @Delete('clear-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async clearAll(@Req() req: any) {
    return this.notificationsService.clearAll(req.user.authId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async deleteNotification(
    @Req() req: any,
    @Param('id') notificationId: string,
  ) {
    return this.notificationsService.deleteNotification(
      req.user.authId,
      notificationId,
    );
  }
}
