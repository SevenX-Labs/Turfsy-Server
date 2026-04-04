import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class UpdateCancellationPolicyDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  allowedBeforeHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  refundPercentage?: number;
}
