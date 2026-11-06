import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GetAudienceDto {
  @ApiProperty({
    description: 'Specific turf ID (UUID) or "ALL_MY_TURFS"',
    example: 'ALL_MY_TURFS',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  turfId: string;
}

