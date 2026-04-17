import { IsString, Matches } from 'class-validator';

export class PaymentDetailsDto {
  @IsString()
  @Matches(/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/, {
    message: 'Enter a valid UPI ID (e.g. name@upi)',
  })
  upiId: string;
}
