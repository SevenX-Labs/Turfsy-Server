import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SuspendTurfDto {
  @ApiProperty({ example: 'Violating platform guidelines', description: 'Reason for suspending the turf', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
