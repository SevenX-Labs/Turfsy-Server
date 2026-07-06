import { IsOptional, IsNumber, Min, IsBoolean, IsUrl, IsEmail, IsString, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @ApiProperty({ example: 90, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  bookingWindowDays?: number;

  @ApiProperty({ example: 'https://turfsy.com/terms', required: false })
  @IsOptional()
  @IsUrl()
  termsUrl?: string;

  @ApiProperty({ example: 'https://turfsy.com/privacy', required: false })
  @IsOptional()
  @IsUrl()
  privacyUrl?: string;

  @ApiProperty({ example: 'support@turfsy.com', required: false })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiProperty({ example: '+919999999999', required: false })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiProperty({ example: {}, required: false })
  @IsOptional()
  @IsObject()
  notificationTemplates?: any;
}
