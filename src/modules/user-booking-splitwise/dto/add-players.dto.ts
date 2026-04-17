import { IsArray, IsString, ArrayNotEmpty, IsNotEmpty } from 'class-validator';

export class AddPlayersDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  usernames: string[];
}
