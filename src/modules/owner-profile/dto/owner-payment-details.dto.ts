import { IsString } from 'class-validator';

export class OwnerPaymentDetailsDto {
  @IsString()
  upiId: string;
}
