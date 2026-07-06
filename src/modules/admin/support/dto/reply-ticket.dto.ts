import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReplyTicketDto {
  @ApiProperty({ example: 'We have processed the refund. It will reflect in 3-5 business days.', description: 'Reply message text content' })
  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  message: string;
}
