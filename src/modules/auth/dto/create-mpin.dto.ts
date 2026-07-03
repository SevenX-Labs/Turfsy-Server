import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMpinDto {
  @ApiProperty({
    description: 'The 4-digit or 6-digit numeric MPIN to create',
    example: '1234',
    type: String,
  })
  @IsString()
  @Matches(/^(\d{4}|\d{6})$/, {
    message: 'MPIN must be a 4-digit or 6-digit numeric code',
  })
  mpin: string;
}
