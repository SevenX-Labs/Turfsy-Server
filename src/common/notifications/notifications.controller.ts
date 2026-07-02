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
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

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
  async saveToken(@Req() req: any, @Body() body: { expoPushToken: string }) {
    const { authId } = req.user;
    const { expoPushToken } = body;

    if (!expoPushToken) {
        return { success: false, message: 'Token is required' };
    }

    // Expo tokens usually look like ExponentPushToken[xxx] or expo.v2:xxx
    const expoTokenRegex = /^(ExponentPushToken\[.+\]|expo\.v2:.+)$/;
    if (!expoTokenRegex.test(expoPushToken)) {
        return { success: false, message: 'Invalid Expo push token format' };
    }

    await this.prisma.auth.update({
      where: { id: authId },
      data: { expoPushToken },
    });

    return { success: true, message: 'Token saved successfully' };
  }

  @Get('test')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async testNotification(@Req() req: any) {
    const { authId } = req.user;

    const user = await this.prisma.auth.findUnique({
      where: { id: authId },
      select: { expoPushToken: true },
    });

    if (!user?.expoPushToken) {
      return { success: false, message: 'No push token found for user' };
    }

    await this.notificationsService.sendNotification(
      authId,
      'Test Notification',
      'This is a test notification from Turfsy! 🚀',
      { type: 'test' },
    );

    return { success: true, message: 'Test notification sent' };
  }
  @Get('inbox')
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
    return this.notificationsService.markAsRead(req.user.authId, notificationId);
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
  async deleteNotification(@Req() req: any, @Param('id') notificationId: string) {
    return this.notificationsService.deleteNotification(req.user.authId, notificationId);
  }
}

