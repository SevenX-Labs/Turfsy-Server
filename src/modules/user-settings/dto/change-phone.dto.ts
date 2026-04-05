import { IsOptional, IsString, Matches } from 'class-validator';

export class ChangePhoneDto {
  @IsString()
  @Matches(/^[0-9]{10}$/, {
    message: 'Phone must be a valid 10-digit number',
  })
  newPhone: string;

  @IsOptional()
  @IsString()
  sessionToken?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{6}$/, {
    message: 'OTP must be 6 digits',
  })
  otp?: string;
}
