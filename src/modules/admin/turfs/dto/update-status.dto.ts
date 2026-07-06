import { IsEnum, IsNotEmpty } from 'class-validator';
import { TurfStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTurfStatusDto {
  @ApiProperty({ enum: TurfStatus, example: 'ACTIVE', description: 'New status for the turf' })
  @IsNotEmpty()
  @IsEnum(TurfStatus)
  status: TurfStatus;
}
