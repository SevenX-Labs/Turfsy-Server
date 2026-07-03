import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
  IsNumberString,
  Length,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOwnerProfileDto {
  @ApiProperty({ example: 'John Doe', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @ApiProperty({ example: 'owner@example.com', required: false })
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  email?: string;

  @ApiProperty({ example: '9876543210', required: false })
  @IsOptional()
  @IsNumberString({}, { message: 'Contact number must be digits only' })
  @Length(10, 10, { message: 'Contact number must be exactly 10 digits' })
  contactNumber?: string;

  // Bank details
  @ApiProperty({ example: 'John Doe', required: false })
  @IsOptional()
  @IsString()
  bankHolderName?: string;

  @ApiProperty({ example: 'HDFC Bank', required: false })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({ example: '50100234567890', required: false })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiProperty({ example: 'HDFC0000123', required: false })
  @IsOptional()
  @IsString()
  ifscCode?: string;
}
