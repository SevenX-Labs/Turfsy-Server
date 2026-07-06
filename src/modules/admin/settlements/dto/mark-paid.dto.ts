import { IsNotEmpty, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MarkPaidDto {
  @ApiProperty({ example: 'TXN_SETTLE_123456', description: 'Transaction payment reference ID/UTR' })
  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  txRef: string;

  @ApiProperty({ example: 'Transferred via IMPS to bank account ending in 4321', description: 'Payment notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
