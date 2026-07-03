import {
  IsArray,
  IsString,
  ArrayNotEmpty,
  IsNotEmpty,
  Matches,
} from 'class-validator';

export class AddPlayersDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @Matches(/^[a-zA-Z0-9_]{3,30}$/, {
    each: true,
    message:
      'Each username must be 3-30 characters, alphanumeric or underscores only',
  })
  usernames: string[];
}
