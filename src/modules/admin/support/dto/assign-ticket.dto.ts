import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignTicketDto {
  @ApiProperty({ example: 'admin-uuid-here', description: 'Admin ID to assign the ticket to' })
  @IsNotEmpty()
  @IsUUID()
  adminId: string;
}
