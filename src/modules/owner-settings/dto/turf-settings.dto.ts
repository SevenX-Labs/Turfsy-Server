import { IsString, IsOptional, IsNumber } from 'class-validator';

export class UpdateTurfSettingsDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  weekdayDayPrice?: number;

  @IsOptional()
  @IsNumber()
  weekdayNightPrice?: number;

  @IsOptional()
  @IsNumber()
  weekendDayPrice?: number;

  @IsOptional()
  @IsNumber()
  weekendNightPrice?: number;

  @IsOptional()
  @IsString()
  openTime?: string;

  @IsOptional()
  @IsString()
  closeTime?: string;

  @IsOptional()
  @IsString()
  groundDayUrl?: string;

  @IsOptional()
  @IsString()
  groundNightUrl?: string;

  @IsOptional()
  @IsString()
  entranceUrl?: string;
}
