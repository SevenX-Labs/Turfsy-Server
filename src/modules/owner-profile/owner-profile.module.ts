import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OwnerProfileService } from './owner-profile.service';
import { OwnerProfileController } from './owner-profile.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET_KEY'),
        signOptions: { expiresIn: '60d' as any },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [OwnerProfileController],
  providers: [OwnerProfileService],
  exports: [OwnerProfileService],
})
export class OwnerProfileModule {}
