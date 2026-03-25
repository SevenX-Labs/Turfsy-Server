import { IsString, Length, IsMobilePhone } from 'class-validator';

export class VerifyOtpDto {
  @IsMobilePhone('en-IN', {}, { message: 'Enter a valid Indian mobile number' })
  phone: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be 6 digits' })
  otp: string;
}