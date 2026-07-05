import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Match } from '../../../common/decorators/match.decorator';

export class ChangeMpinDto {
  @ApiProperty({
    description: 'The current 4-digit or 6-digit numeric MPIN',
    example: '1234',
    type: String,
  })
  @IsString()
  @Matches(/^(\d{4}|\d{6})$/, {
    message: 'Current MPIN must be a 4-digit or 6-digit numeric code',
  })
  currentMpin: string;

  @ApiProperty({
    description: 'The new 4-digit or 6-digit numeric MPIN',
    example: '5678',
    type: String,
  })
  @IsString()
  @Matches(/^(\d{4}|\d{6})$/, {
    message: 'New MPIN must be a 4-digit or 6-digit numeric code',
  })
  newMpin: string;

  @ApiProperty({
    description: 'Confirm the new 4-digit or 6-digit numeric MPIN',
    example: '5678',
    type: String,
  })
  @IsString()
  @Match('newMpin', { message: 'Confirm MPIN must match new MPIN' })
  confirmMpin: string;
}
