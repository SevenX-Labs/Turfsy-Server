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

export class CreateTurfDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(SportsType, { message: 'sportsType must be FOOTBALL or CRICKET' })
  sportsType: SportsType;

  @IsString()
  turfSize: string;

  // Location
  @IsString()
  address: string;

  @IsString()
  city: string;

  @IsString()
  pincode: string;

  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;

  // Timings
  @IsString()
  openTime: string;

  @IsString()
  closeTime: string;

  @IsNumber()
  @Min(30)
  minSlotDurationMins: number;

  // Amenities
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

  // Pricing
  @IsNumber()
  weekdayDayPrice: number;

  @IsNumber()
  weekdayNightPrice: number;

  @IsNumber()
  weekendDayPrice: number;

  @IsNumber()
  weekendNightPrice: number;
}
