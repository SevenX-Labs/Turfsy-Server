import { IsNotEmpty, IsString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum NotificationTarget {
  ALL_USERS = 'ALL_USERS',
  ALL_OWNERS = 'ALL_OWNERS',
  BY_CITY = 'BY_CITY',
  PROMOTIONAL = 'PROMOTIONAL',
}

export class BroadcastNotificationDto {
  @ApiProperty({ enum: NotificationTarget, example: 'ALL_USERS', description: 'Target group' })
  @IsNotEmpty()
  @IsEnum(NotificationTarget)
  target: NotificationTarget;

  @ApiProperty({ example: 'Bangalore', description: 'Target city name (required if target is BY_CITY)', required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: 'Maintenance Alert', description: 'Notification title' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ example: 'The system will be down tonight for 2 hours.', description: 'Notification body message' })
  @IsNotEmpty()
  @IsString()
  body: string;

  @ApiProperty({ example: { type: 'SYSTEM_MAINTENANCE' }, description: 'Optional key-value data payload', required: false })
  @IsOptional()
  @IsObject()
  data?: any;
}
