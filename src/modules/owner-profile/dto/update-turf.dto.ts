import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  MaxLength,
} from 'class-validator';
import { SportsType } from '@prisma/client';

export class UpdateTurfDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(SportsType)
  sportsType?: SportsType;

  @IsOptional()
  @IsString()
  turfSize?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  openTime?: string;

  @IsOptional()
  @IsString()
  closeTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(30)
  minSlotDurationMins?: number;

  @IsOptional()
  @IsBoolean()
  floodLights?: boolean;

  @IsOptional()
  @IsBoolean()
  parking?: boolean;

  @IsOptional()
  @IsBoolean()
  washroom?: boolean;

  @IsOptional()
  @IsBoolean()
  changingRoom?: boolean;

  @IsOptional()
  @IsBoolean()
  drinkingWater?: boolean;

  @IsOptional()
  @IsBoolean()
  seatingArea?: boolean;

  @IsOptional()
  @IsBoolean()
  cafeteria?: boolean;

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
}
