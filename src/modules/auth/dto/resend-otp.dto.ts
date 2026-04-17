import { IsMobilePhone } from 'class-validator';

export class ResendOtpDto {
  @IsMobilePhone('en-IN', {}, { message: 'Enter a valid Indian mobile number' })
  phone: string;
}
