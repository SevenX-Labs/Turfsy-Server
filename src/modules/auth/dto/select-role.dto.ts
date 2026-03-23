import { IsEnum } from 'class-validator';
import { Role } from '@prisma/client';

export class SelectRoleDto {
  @IsEnum(Role, { message: 'Role must be USER or OWNER' })
  role: Role;
}
