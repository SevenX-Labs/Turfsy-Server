import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SaveTokenDto {
  @ApiPropertyOptional({
    description: 'Native FCM or device push registration token',
    example: 'f-D49a_8S0q...:APA91bF...',
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(4096)
  token?: string;

  @ApiPropertyOptional({
    description: 'FCM push registration token alias',
    example: 'f-D49a_8S0q...:APA91bF...',
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(4096)
  fcmToken?: string;

  @ApiPropertyOptional({
    description: 'Legacy Expo push token alias for backwards compatibility',
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(4096)
  expoPushToken?: string;

  @ApiPropertyOptional({
    description: 'Client device operating system platform',
    example: 'android',
    default: 'android',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  platform?: string;

  @ApiPropertyOptional({
    description: 'Unique client hardware/installation device ID',
    example: 'd9a30fa2-b289-4e78-98e3-054f15d781b2',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;
}
