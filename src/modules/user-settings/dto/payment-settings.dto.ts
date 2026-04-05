import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateUserPaymentSettingsDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/, {
    message: 'Invalid UPI ID format',
  })
  upiId?: string;

  @IsOptional()
  @IsEnum(['UPI', 'BANK'])
  defaultPaymentMethod?: 'UPI' | 'BANK';
}
