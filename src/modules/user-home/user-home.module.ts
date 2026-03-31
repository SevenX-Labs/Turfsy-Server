import { Module } from '@nestjs/common';
import { UserHomeController } from './user-home.controller';
import { UserHomeService } from './user-home.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PrismaModule, // provides PrismaService
    AuthModule,   // provides JwtStrategy + guards
  ],
  controllers: [UserHomeController],
  providers: [UserHomeService],
})
export class UserHomeModule {}