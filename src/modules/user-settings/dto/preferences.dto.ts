import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { SportsType } from '@prisma/client';

export class UpdateUserPreferencesDto {
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @IsOptional()
  @IsEnum(['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'])
  preferredTime?: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT';

  @IsOptional()
  @IsEnum(SportsType)
  favoriteSport?: SportsType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsUUID(4, {
    each: true,
    message: 'Each favorite turf ID must be a valid UUID',
  })
  favoriteTurfIds?: string[];
}
