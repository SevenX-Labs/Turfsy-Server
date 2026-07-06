import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SuspendUserDto {
  @ApiProperty({ example: 'Violating platform guidelines', description: 'Reason for suspension' })
  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  reason: string;
}
