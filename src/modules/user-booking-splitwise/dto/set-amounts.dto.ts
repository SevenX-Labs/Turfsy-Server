import { IsArray, ValidateNested, IsNumber, IsString, IsNotEmpty, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PlayerAmountDto {
  @IsString()
  @IsNotEmpty()
  playerId: string;

  @IsNumber()
  @Min(1)
  amount: number;
}

export class SetAmountsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlayerAmountDto)
  amounts: PlayerAmountDto[];
}
