import {
  IsString,
  IsEmail,
  MinLength,
  MaxLength,
  IsNumberString,
  Length,
} from 'class-validator';

export class CreateOwnerProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @IsNumberString({}, { message: 'Contact number must be digits only' })
  @Length(10, 10, { message: 'Contact number must be exactly 10 digits' })
  contactNumber: string;
}
