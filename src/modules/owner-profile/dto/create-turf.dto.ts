import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  MaxLength,
} from 'class-validator';
import {
  SportsType,
  TurfPaymentPreference,
  BookingApprovalType,
} from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTurfDto {
  @ApiProperty({ example: 'Dream Turf' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Best football ground in Mumbai', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: SportsType, example: 'FOOTBALL' })
  @IsEnum(SportsType, { message: 'sportsType must be FOOTBALL or CRICKET' })
  sportsType: SportsType;

  @ApiProperty({ example: '7v7' })
  @IsString()
  turfSize: string;

  // Location
  @ApiProperty({ example: 'Thane, Mumbai' })
  @IsString()
  address: string;

  @ApiProperty({ example: 'Mumbai' })
  @IsString()
  city: string;

  @ApiProperty({ example: '400601' })
  @IsString()
  pincode: string;

  @ApiProperty({ example: 19.2 })
  @IsNumber()
  lat: number;

  @ApiProperty({ example: 72.9 })
  @IsNumber()
  lng: number;

  // Timings
  @ApiProperty({ example: '06:00' })
  @IsString()
  openTime: string;

  @ApiProperty({ example: '23:00' })
  @IsString()
  closeTime: string;

  @ApiProperty({ example: 60 })
  @IsNumber()
  @Min(30)
  minSlotDurationMins: number;

  // Amenities
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

  // Pricing
  @ApiProperty({ example: 1000 })
  @IsNumber()
  weekdayDayPrice: number;

  @ApiProperty({ example: 1500 })
  @IsNumber()
  weekdayNightPrice: number;

  @ApiProperty({ example: 1200 })
  @IsNumber()
  weekendDayPrice: number;

  @ApiProperty({ example: 1800 })
  @IsNumber()
  weekendNightPrice: number;

  @ApiProperty({
    enum: TurfPaymentPreference,
    example: ['FULL_ONLINE'],
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsEnum(TurfPaymentPreference, {
    each: true,
    message:
      'Each paymentPreference must be FULL_ONLINE, ADVANCE_PAYMENT, or FULL_CASH',
  })
  paymentPreferences?: TurfPaymentPreference[];

  @ApiProperty({
    enum: BookingApprovalType,
    example: 'INSTANT',
    required: false,
  })
  @IsOptional()
  @IsEnum(BookingApprovalType, {
    message: 'bookingApprovalType must be INSTANT or MANUAL',
  })
  bookingApprovalType?: BookingApprovalType;
}
