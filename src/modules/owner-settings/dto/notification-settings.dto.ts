import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  bookingAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  cancellationAlerts?: boolean;
}
