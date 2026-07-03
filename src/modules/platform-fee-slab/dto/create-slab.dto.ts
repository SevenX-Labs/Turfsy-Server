import { IsNumber, IsBoolean, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSlabDto {
  @ApiProperty({ example: 0 })
  @IsNumber()
  @Min(0)
  minAmount: number;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @Min(0)
  maxAmount: number;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(0)
  platformFee: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
