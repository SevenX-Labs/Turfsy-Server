import { IsOptional, IsString } from 'class-validator';

export class UserHomeQueryDto {
  @IsOptional()
  @IsString()
  lat?: string;

  @IsOptional()
  @IsString()
  lng?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  radiusKm?: string;
}
