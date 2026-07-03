// Triggering IDE TS Server type cache refresh after schema update
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  Length,
  Matches,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AccountType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

// Helper functions for custom validation
export function isSequential(str: string): boolean {
  const len = str.length;
  if (len < 2) return false;
  let isInc = true;
  let isDec = true;
  for (let i = 1; i < len; i++) {
    const diff = str.charCodeAt(i) - str.charCodeAt(i - 1);
    if (diff !== 1) isInc = false;
    if (diff !== -1) isDec = false;
  }
  return isInc || isDec;
}

export function isRepeatedPattern(str: string): boolean {
  const len = str.length;
  for (let k = 2; k <= Math.floor(len / 2); k++) {
    if (len % k === 0) {
      const sub = str.slice(0, k);
      if (sub.repeat(len / k) === str) {
        return true;
      }
    }
  }
  return false;
}

// Custom validator for Match Field
export function MatchField(property: string, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'matchField',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as any)[relatedPropertyName];
          return value === relatedValue;
        },
        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          return `${args.property} must exactly match ${relatedPropertyName}`;
        },
      },
    });
  };
}

// Custom validator for Account Number rules
export function IsValidAccountNumber(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidAccountNumber',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          if (!/^\d+$/.test(value)) return false;
          if (value.startsWith('0')) return false;
          if (new Set(value).size === 1) return false;
          if (isSequential(value)) return false;
          if (isRepeatedPattern(value)) return false;
          return true;
        },
        defaultMessage(args: ValidationArguments) {
          const value = args.value;
          if (typeof value !== 'string') return 'Account number must be a string';
          if (!/^\d+$/.test(value)) return 'Account number must contain digits only';
          if (value.startsWith('0')) return 'Account number must not start with 0';
          if (new Set(value).size === 1) return 'Account number cannot consist of identical digits';
          if (isSequential(value)) return 'Account number cannot be a sequential sequence';
          if (isRepeatedPattern(value)) return 'Account number cannot contain repeated patterns';
          return 'Account number is invalid';
        },
      },
    });
  };
}

export class UpdatePaymentSettingsDto {
  @ApiProperty({
    description: 'The name of the bank account holder (Required)',
    example: 'John Doe',
    required: true,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'Account holder name is required' })
  @IsString({ message: 'Account holder name must be a string' })
  @Length(3, 100, { message: 'Account holder name must be between 3 and 100 characters' })
  @Matches(/^[a-zA-Z\s.]+$/, {
    message: 'Account holder name can only contain alphabets, spaces, and dots',
  })
  bankHolderName: string;

  @ApiProperty({
    description: 'The name of the bank (Required)',
    example: 'HDFC Bank',
    required: true,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'Bank name is required' })
  @IsString({ message: 'Bank name must be a string' })
  @Length(3, 100, { message: 'Bank name must be between 3 and 100 characters' })
  @Matches(/^[a-zA-Z\s&]+$/, {
    message: 'Bank name can only contain alphabets, spaces, and &',
  })
  bankName: string;

  @ApiProperty({
    description: 'The bank account number (Required)',
    example: '50100234567890',
    required: true,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'Account number is required' })
  @IsString({ message: 'Account number must be a string' })
  @Length(9, 18, { message: 'Account number must be between 9 and 18 digits' })
  @Matches(/^\d+$/, { message: 'Account number must contain digits only' })
  @Matches(/^[1-9]/, { message: 'Account number must not start with 0' })
  @IsValidAccountNumber()
  accountNumber: string;

  @ApiProperty({
    description: 'Confirmation of the bank account number (Required)',
    example: '50100234567890',
    required: true,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'Confirm account number is required' })
  @IsString({ message: 'Confirm account number must be a string' })
  @MatchField('accountNumber', {
    message: 'Confirm account number must exactly match account number',
  })
  confirmAccountNumber: string;

  @ApiProperty({
    description: 'The bank IFSC code (Required)',
    example: 'HDFC0001234',
    required: true,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsNotEmpty({ message: 'IFSC code is required' })
  @IsString({ message: 'IFSC code must be a string' })
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, {
    message: 'IFSC code must match the valid RBI IFSC format (e.g. HDFC0001234)',
  })
  ifscCode: string;

  @ApiProperty({
    description: 'The bank account type (SAVINGS or CURRENT) (Required)',
    enum: AccountType,
    example: 'SAVINGS',
    required: true,
  })
  @IsNotEmpty({ message: 'Account type is required' })
  @IsEnum(AccountType, {
    message: 'Account type must be either SAVINGS or CURRENT',
  })
  accountType: AccountType;
}
