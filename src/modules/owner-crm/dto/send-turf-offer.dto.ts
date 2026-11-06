import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsDateString,
  IsObject,
} from 'class-validator';

export class SendTurfOfferDto {
  @ApiProperty({
    description: 'Specific turf ID (UUID) or "ALL_MY_TURFS" to broadcast across all owned venues',
    example: 'ALL_MY_TURFS',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  turfId: string;

  @ApiProperty({
    description: 'Promotional broadcast title',
    example: '⚡ Special 20% Off Weekend Offer at Turfzy Arena!',
    minLength: 3,
    maxLength: 65,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(65)
  title: string;

  @ApiProperty({
    description: 'Promotional message body describing the offer',
    example: 'Book your football slot this Saturday & Sunday and get a flat 20% instant discount with code WEEKEND20!',
    minLength: 10,
    maxLength: 250,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(250)
  message: string;

  @ApiPropertyOptional({
    description: 'Optional promo or voucher code for redemption',
    example: 'WEEKEND20',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  offerCode?: string;

  @ApiPropertyOptional({
    description: 'Discount percentage value (1-100)',
    example: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  discountPercentage?: number;

  @ApiPropertyOptional({
    description: 'Offer expiry ISO timestamp',
    example: '2026-11-30T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({
    description: 'Optional custom metadata payload dictionary for app deep linking',
    example: { type: 'TURF_OFFER', click_action: 'OPEN_TURF_DETAILS' },
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}

