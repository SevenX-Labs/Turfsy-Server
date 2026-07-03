import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetMpinDto {
  @ApiProperty({
    description: 'The new 4-digit or 6-digit numeric MPIN',
    example: '4321',
    type: String,
  })
  @IsString()
  @Matches(/^(\d{4}|\d{6})$/, {
    message: 'New MPIN must be a 4-digit or 6-digit numeric code',
  })
  newMpin: string;
}
