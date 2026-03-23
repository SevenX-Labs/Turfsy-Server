import { IsMobilePhone } from 'class-validator';

export class LoginDto {
  @IsMobilePhone('en-IN', {}, { message: 'Enter a valid Indian mobile number' })
  phone: string;
}