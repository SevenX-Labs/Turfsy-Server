import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserProfileModule } from './modules/user-profile/user-profile.module';
import { OwnerProfileModule } from './modules/owner-profile/owner-profile.module';
import { TurfsModule } from './modules/turfs/turfs.module';
import { UploadModule } from './modules/upload/upload.module';
import { UserHomeModule } from './modules/user-home/user-home.module';
import { SavedTurfsModule } from './modules/saved-turfs/saved-turfs.module';
import { BookingModule } from './modules/booking/booking.module';
import { OwnerHomeModule } from './modules/owner-home/owner-home.module';
import { OwnerAnalyticsModule } from './modules/owner-analytics/owner-analytics.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,
    }]),
    PrismaModule, 
    AuthModule, 
    UserProfileModule, 
    OwnerProfileModule, 
    TurfsModule, 
    UploadModule,
    UserHomeModule,
    SavedTurfsModule,
    BookingModule,
    OwnerHomeModule,
    OwnerAnalyticsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
