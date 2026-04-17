import { IsArray, ValidateNested, IsNumber, IsString, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class PlayerAmountDto {
  @IsString()
  @IsNotEmpty()
  playerId: string;

  @IsNumber()
  amount: number;
}

export class SetAmountsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlayerAmountDto)
  amounts: PlayerAmountDto[];
}
