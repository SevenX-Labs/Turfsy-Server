import { IsString, IsMobilePhone, IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class LoginDto {
  @IsMobilePhone('en-IN', {}, { message: 'Enter a valid Indian mobile number' })
  phone: string;

  @IsEnum(Role, { message: 'Role must be USER or OWNER' })
  role: Role;
}