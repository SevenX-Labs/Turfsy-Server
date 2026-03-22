import { IsString } from 'class-validator';

export class ResendOtpDto {
  @IsString()
  sessionToken: string;
}