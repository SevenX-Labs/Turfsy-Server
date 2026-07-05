import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Match } from '../../../common/decorators/match.decorator';

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

  @ApiProperty({
    description: 'Confirm the 4-digit or 6-digit numeric MPIN',
    example: '1234',
    type: String,
  })
  @IsString()
  @Match('mpin', { message: 'Confirm MPIN must match MPIN' })
  confirmMpin: string;
}
