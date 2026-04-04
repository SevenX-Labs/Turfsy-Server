import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { PayoutMethod } from '@prisma/client';

export class UpdatePaymentSettingsDto {
  @IsOptional()
  @IsString()
  upiId?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  payoutFrequency?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(PayoutMethod)
  payoutMethod?: PayoutMethod;
}
