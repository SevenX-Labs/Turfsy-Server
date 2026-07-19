import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  Min,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSettlementDto {
  @ApiProperty({ example: 'owner-uuid-here', description: 'Owner Profile ID' })
  @IsNotEmpty()
  @IsUUID()
  ownerProfileId: string;

  @ApiProperty({ example: 4500, description: 'Amount to settle' })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({
    example: 'Payout for June week 4',
    description: 'Settlement internal notes',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    example: 12,
    description: 'Number of bookings in this settlement',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  bookingCount?: number;

  @ApiProperty({
    example: '2026-06-01 to 2026-06-07',
    description: 'Settlement period date range',
    required: false,
  })
  @IsOptional()
  @IsString()
  period?: string;
}
