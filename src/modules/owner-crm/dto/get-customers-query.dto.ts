import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetCustomersQueryDto {
  @ApiPropertyOptional({
    description: 'Turf ID or ALL_MY_TURFS',
    default: 'ALL_MY_TURFS',
  })
  @IsOptional()
  @IsString()
  turfId?: string = 'ALL_MY_TURFS';

  @ApiPropertyOptional({
    description: 'Search string for customer name or phone',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Limit items (1-200)',
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Offset items',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
