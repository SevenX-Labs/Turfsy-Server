import {
  IsString,
  IsEmail,
  IsEnum,
  IsDateString,
  IsOptional,
  IsNumber,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Gender, SportsType } from '@prisma/client';

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'Username can only contain lowercase letters, numbers, and underscores',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  email?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Enter a valid date (YYYY-MM-DD)' })
  dob?: string;

  @IsOptional()
  @IsEnum(Gender, {
    message: 'Gender must be MALE, FEMALE, OTHER or PREFER_NOT_TO_SAY',
  })
  gender?: Gender;

  @IsOptional()
  @IsNumber()
  currentLat?: number;

  @IsOptional()
  @IsNumber()
  currentLng?: number;

  @IsOptional()
  @IsString()
  houseNumber?: string;

  @IsOptional()
  @IsString()
  societyName?: string;

  @IsOptional()
  @IsString()
  landmark?: string;

  @IsOptional()
  @IsString()
  roadName?: string;

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
