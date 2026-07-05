import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PrismaService } from './src/prisma/prisma.service';
import { SportsType, TurfStatus, TurfPaymentPreference, BookingApprovalType, Role } from '@prisma/client';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  let owner = await prisma.ownerProfile.findFirst();

  if (!owner) {
    console.log("No owner found. Creating a test owner...");
    const auth = await prisma.auth.create({
      data: {
        phone: '1234567890',
        role: Role.OWNER,
        isVerified: true,
      }
    });

    owner = await prisma.ownerProfile.create({
      data: {
        authId: auth.id,
        name: 'Test Owner',
        email: 'owner@test.com',
        contactNumber: '1234567890'
      }
    });
  }

  console.log("Using Owner ID:", owner.id);

  const turf1 = await prisma.turf.create({
    data: {
      ownerProfileId: owner.id,
      name: 'Sahil Turf',
      description: 'Test turf accepting all 3 payment preferences.',
      sportsType: SportsType.FOOTBALL,
      turfSize: '5v5',
      status: TurfStatus.ACTIVE,
      isFeatured: true,
      address: '123 Stadium Road',
      city: 'Pune',
      pincode: '411001',
      lat: 18.5204,
      lng: 73.8567,
      openTime: '06:00',
      closeTime: '23:59',
      minSlotDurationMins: 60,
      weekdayDayPrice: 1000,
      weekdayNightPrice: 1200,
      weekendDayPrice: 1200,
      weekendNightPrice: 1500,
      cancellationAllowedBeforeHours: 2,
      cancellationRefundPercentage: 75.0,
      paymentPreferences: [
        TurfPaymentPreference.FULL_ONLINE,
        TurfPaymentPreference.ADVANCE_PAYMENT,
        TurfPaymentPreference.FULL_CASH
      ],
      bookingApprovalType: BookingApprovalType.MANUAL,
    }
  });

  const turf2 = await prisma.turf.create({
    data: {
      ownerProfileId: owner.id,
      name: 'Tanishka Turf',
      description: 'Test turf accepting only 2 payment preferences.',
      sportsType: SportsType.CRICKET,
      turfSize: '7v7',
      status: TurfStatus.ACTIVE,
      isFeatured: false,
      address: '456 Cash Road',
      city: 'Pune',
      pincode: '411002',
      lat: 18.5304,
      lng: 73.8667,
      openTime: '06:00',
      closeTime: '23:59',
      minSlotDurationMins: 60,
      weekdayDayPrice: 800,
      weekdayNightPrice: 1000,
      weekendDayPrice: 1000,
      weekendNightPrice: 1200,
      cancellationAllowedBeforeHours: 2,
      cancellationRefundPercentage: 75.0,
      paymentPreferences: [
        TurfPaymentPreference.ADVANCE_PAYMENT,
        TurfPaymentPreference.FULL_CASH
      ],
      bookingApprovalType: BookingApprovalType.INSTANT,
    }
  });

  console.log("Successfully created Turfs:", turf1.name, "and", turf2.name);
  await app.close();
}
main().catch(console.error);
