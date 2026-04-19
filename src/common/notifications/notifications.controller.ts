import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

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

    await this.notificationsService.sendPush(
      user.expoPushToken,
      'Test Notification',
      'This is a test notification from Turfsy! 🚀',
      { type: 'test' },
    );

    return { success: true, message: 'Test notification sent' };
  }
}
