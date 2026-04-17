import { IsEnum, IsNotEmpty } from 'class-validator';
import { SplitPlayerStatus } from '@prisma/client';

export class UpdateSplitStatusDto {
  @IsEnum(SplitPlayerStatus)
  @IsNotEmpty()
  status: SplitPlayerStatus;
}
