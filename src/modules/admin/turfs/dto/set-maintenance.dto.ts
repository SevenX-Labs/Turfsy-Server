import {
  IsNotEmpty,
  IsDateString,
  IsString,
  IsOptional,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetMaintenanceDto {
  @ApiProperty({
    example: '2026-07-10T08:00:00Z',
    description: 'Maintenance window start date/time',
  })
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiProperty({
    example: '2026-07-10T18:00:00Z',
    description: 'Maintenance window end date/time',
  })
  @IsNotEmpty()
  @IsDateString()
  endDate: string;

  @ApiProperty({
    example: 'Resurfacing grass and replacing lighting systems',
    description: 'Reason for maintenance',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(4)
  reason?: string;
}
