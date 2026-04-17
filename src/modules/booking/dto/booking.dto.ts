import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Min,
  Max,
  MaxLength,
  IsNumber,
} from 'class-validator';

export class CreateBookingDto {
  @IsUUID('4', { message: 'Invalid turf ID format' })
  @IsNotEmpty()
  turfId: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'bookingDate must be YYYY-MM-DD format',
  })
  bookingDate: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime must be HH:MM (24hr) format',
  })
  startTime: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime must be HH:MM (24hr) format',
  })
  endTime: string;

  @IsInt({ message: 'durationMins must be an integer' })
  @Min(60, { message: 'Minimum duration is 60 minutes' })
  @Max(360, { message: 'Maximum duration is 360 minutes' })
  durationMins: number;

  @IsIn(['ONLINE', 'CASH'], { message: 'paymentType must be ONLINE or CASH' })
  paymentType: 'ONLINE' | 'CASH';

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Notes maximum 200 characters' })
  notes?: string;

  @IsOptional()
  @IsInt({ message: 'playersCount must be an integer' })
  @Min(1, { message: 'Minimum 1 player' })
  @Max(100, { message: 'Maximum 100 players' })
  playersCount?: number;
}

export class ConfirmPaymentDto {
  @IsString()
  @IsNotEmpty({ message: 'razorpayOrderId is required' })
  razorpayOrderId: string;

  @IsString()
  @IsNotEmpty({ message: 'razorpayPaymentId is required' })
  razorpayPaymentId: string;

  @IsString()
  @IsNotEmpty({ message: 'razorpaySignature is required' })
  razorpaySignature: string;
}

export class VerifyPinDto {
  @IsString()
  @IsNotEmpty({ message: 'PIN is required' })
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 numeric digits' })
  pin: string;
}

export class RateTurfDto {
  @IsInt({ message: 'Rating must be an integer' })
  @Min(1, { message: 'Rating minimum is 1' })
  @Max(5, { message: 'Rating maximum is 5' })
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Review maximum 500 characters' })
  review?: string;
}

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Reason maximum 200 characters' })
  reason?: string;
}
