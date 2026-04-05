import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateUserNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  bookingAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  offerAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  reminderAlerts?: boolean;
}
