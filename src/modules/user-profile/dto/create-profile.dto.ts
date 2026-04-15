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
import { Gender, SportsType } from '@prisma/client';

export class CreateUserProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @IsDateString({}, { message: 'Enter a valid date (YYYY-MM-DD)' })
  dob: string;

  @IsEnum(Gender, {
    message: 'Gender must be MALE, FEMALE, OTHER or PREFER_NOT_TO_SAY',
  })
  gender: Gender;

  @IsOptional()
  @IsNumber()
  currentLat?: number;

  @IsOptional()
  @IsNumber()
  currentLng?: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsEnum(SportsType, { message: 'preferredSport must be FOOTBALL or CRICKET' })
  preferredSport?: SportsType;
}
