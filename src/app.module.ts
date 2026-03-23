import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserProfileModule } from './modules/user-profile/user-profile.module';
import { OwnerProfileModule } from './modules/owner-profile/owner-profile.module';
import { TurfsModule } from './modules/turfs/turfs.module';

@Module({
  imports: [PrismaModule, AuthModule, UserProfileModule, OwnerProfileModule, TurfsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

