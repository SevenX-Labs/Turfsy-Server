import {
  IsString,
  IsEmail,
  IsEnum,
  IsDateString,
  IsOptional,
  IsNumber,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Gender } from '@prisma/client';

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  email?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Enter a valid date (YYYY-MM-DD)' })
  dob?: string;

  @IsOptional()
  @IsEnum(Gender, { message: 'Gender must be MALE, FEMALE, OTHER or PREFER_NOT_TO_SAY' })
  gender?: Gender;

  @IsOptional()
  @IsNumber()
  currentLat?: number;

  @IsOptional()
  @IsNumber()
  currentLng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  currentCity?: string;
}