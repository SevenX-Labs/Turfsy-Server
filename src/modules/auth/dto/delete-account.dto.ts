import { IsString } from 'class-validator';

export class DeleteAccountDto {
  @IsString()
  sessionToken: string;
}