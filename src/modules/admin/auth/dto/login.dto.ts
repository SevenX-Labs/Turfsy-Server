import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminLoginDto {
  @ApiProperty({ example: process.env.ADMIN_EMAIL, description: 'Admin email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: process.env.ADMIN_PASSWORD, description: 'Admin password' })
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
