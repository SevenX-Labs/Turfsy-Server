import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsString,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';

export class CreateMaintenanceDto {
  @ApiProperty({ example: 'turf-uuid-here' })
  @IsUUID('4')
  @IsNotEmpty()
  turfId: string;

  @ApiPropertyOptional({
    example: '2026-08-15',
    description: 'Single date in YYYY-MM-DD format',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    example: ['2026-08-15', '2026-08-18'],
    description: 'List of specific dates in YYYY-MM-DD format',
  })
  @IsOptional()
  @IsArray()
  @IsDateString({}, { each: true })
  dates?: string[];

  @ApiPropertyOptional({
    example: '2026-08-15',
    description: 'Start date of range in YYYY-MM-DD format',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-08-20',
    description: 'End date of range in YYYY-MM-DD format',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    example: 'Ground Renovation',
    description: 'Reason for blocking',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateMaintenanceDto {
  @ApiProperty({
    example: '2026-08-15',
    description: 'Start date of range in YYYY-MM-DD format',
  })
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiProperty({
    example: '2026-08-20',
    description: 'End date of range in YYYY-MM-DD format',
  })
  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    example: 'Ground Renovation',
    description: 'Reason for blocking',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
