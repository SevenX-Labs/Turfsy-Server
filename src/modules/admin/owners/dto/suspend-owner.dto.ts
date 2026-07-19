import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SuspendOwnerDto {
  @ApiProperty({
    example: 'KYC validation failure',
    description: 'Reason for owner suspension',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  reason: string;
}
