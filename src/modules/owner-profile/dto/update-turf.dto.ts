import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  MaxLength,
} from 'class-validator';
import { SportsType, TurfPaymentPreference } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTurfDto {
  @ApiProperty({ example: 'Dream Turf', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'Best football ground in Mumbai', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: SportsType, example: 'FOOTBALL', required: false })
  @IsOptional()
  @IsEnum(SportsType)
  sportsType?: SportsType;

  @ApiProperty({ example: '7v7', required: false })
  @IsOptional()
  @IsString()
  turfSize?: string;

  @ApiProperty({ example: 'Thane, Mumbai', required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 'Mumbai', required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: '400601', required: false })
  @IsOptional()
  @IsString()
  pincode?: string;

  @ApiProperty({ example: 19.2, required: false })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiProperty({ example: 72.9, required: false })
  @IsOptional()
  @IsNumber()
  lng?: number;

  @ApiProperty({ example: '06:00', required: false })
  @IsOptional()
  @IsString()
  openTime?: string;

  @ApiProperty({ example: '23:00', required: false })
  @IsOptional()
  @IsString()
  closeTime?: string;

  @ApiProperty({ example: 60, required: false })
  @IsOptional()
  @IsNumber()
  @Min(30)
  minSlotDurationMins?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  floodLights?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  parking?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  washroom?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  changingRoom?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  drinkingWater?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  seatingArea?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  cafeteria?: boolean;

  @ApiProperty({ example: 1000, required: false })
  @IsOptional()
  @IsNumber()
  weekdayDayPrice?: number;

  @ApiProperty({ example: 1500, required: false })
  @IsOptional()
  @IsNumber()
  weekdayNightPrice?: number;

  @ApiProperty({ example: 1200, required: false })
  @IsOptional()
  @IsNumber()
  weekendDayPrice?: number;

  @ApiProperty({ example: 1800, required: false })
  @IsOptional()
  @IsNumber()
  weekendNightPrice?: number;

  @ApiProperty({
    enum: TurfPaymentPreference,
    example: 'FULL_ONLINE',
    required: false,
  })
  @IsOptional()
  @IsEnum(TurfPaymentPreference, {
    message: 'paymentPreference must be FULL_ONLINE, ADVANCE_PAYMENT, or FULL_CASH',
  })
  paymentPreference?: TurfPaymentPreference;
}
