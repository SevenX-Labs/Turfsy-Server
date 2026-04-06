-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'OWNER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "SportsType" AS ENUM ('FOOTBALL', 'CRICKET');

-- CreateEnum
CREATE TYPE "TurfStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('ONLINE', 'CASH');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('UPI', 'BANK');

-- CreateTable
CREATE TABLE "Auth" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "authId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "avatarUrl" TEXT,
    "dob" TIMESTAMP(3),
    "gender" "Gender",
    "preferred_sport" "SportsType",
    "currentLat" DOUBLE PRECISION,
    "currentLng" DOUBLE PRECISION,
    "currentCity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerProfile" (
    "id" TEXT NOT NULL,
    "authId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "contactNumber" TEXT,
    "avatarUrl" TEXT,
    "aadharNumber" TEXT,
    "aadharUrl" TEXT,
    "isKycVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turf" (
    "id" TEXT NOT NULL,
    "ownerProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sportsType" "SportsType" NOT NULL,
    "turfSize" TEXT NOT NULL,
    "status" "TurfStatus" NOT NULL DEFAULT 'ACTIVE',
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    "minSlotDurationMins" INTEGER NOT NULL,
    "groundDayUrl" TEXT,
    "groundNightUrl" TEXT,
    "entranceUrl" TEXT,
    "floodLights" BOOLEAN NOT NULL DEFAULT false,
    "parking" BOOLEAN NOT NULL DEFAULT false,
    "washroom" BOOLEAN NOT NULL DEFAULT false,
    "changingRoom" BOOLEAN NOT NULL DEFAULT false,
    "drinkingWater" BOOLEAN NOT NULL DEFAULT false,
    "seatingArea" BOOLEAN NOT NULL DEFAULT false,
    "cafeteria" BOOLEAN NOT NULL DEFAULT false,
    "weekdayDayPrice" DOUBLE PRECISION NOT NULL,
    "weekdayNightPrice" DOUBLE PRECISION NOT NULL,
    "weekendDayPrice" DOUBLE PRECISION NOT NULL,
    "weekendNightPrice" DOUBLE PRECISION NOT NULL,
    "cancellationAllowedBeforeHours" INTEGER NOT NULL DEFAULT 2,
    "cancellationRefundPercentage" DOUBLE PRECISION NOT NULL DEFAULT 75.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Turf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "authId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "upiId" TEXT NOT NULL,
    "userProfileId" TEXT,
    "ownerProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bank_account" TEXT,
    "payout_method" "PayoutMethod" DEFAULT 'UPI',
    "payout_frequency" TEXT DEFAULT 'MANUAL',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "authId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpEntry" (
    "id" TEXT NOT NULL,
    "authId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "lastResentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_turfs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "turf_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "saved_turfs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "turf_id" TEXT NOT NULL,
    "booking_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "duration_mins" INTEGER NOT NULL,
    "booking_status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "payment_type" "PaymentType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "deposit_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "razorpay_order_id" TEXT,
    "razorpay_payment_id" TEXT,
    "check_in_pin" TEXT,
    "pin_attempts" INTEGER NOT NULL DEFAULT 0,
    "pin_locked" BOOLEAN NOT NULL DEFAULT false,
    "pin_expires_at" TIMESTAMP(3),
    "visited_at" TIMESTAMP(3),
    "razorpay_refund_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "notes" TEXT,
    "players_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_locks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "turf_id" TEXT NOT NULL,
    "booking_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "booking_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slot_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turf_ratings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "turf_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "review" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turf_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_gamification" (
    "id" TEXT NOT NULL,
    "auth_id" TEXT NOT NULL,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "total_matches" INTEGER NOT NULL DEFAULT 0,
    "total_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_played_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_gamification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "auth_id" TEXT NOT NULL,
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "preferred_time" TEXT,
    "favorite_sport" "SportsType",
    "favorite_turf_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "booking_alerts" BOOLEAN NOT NULL DEFAULT true,
    "offer_alerts" BOOLEAN NOT NULL DEFAULT true,
    "reminder_alerts" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner-settings" (
    "id" TEXT NOT NULL,
    "auth_id" TEXT NOT NULL,
    "upi_id" TEXT,
    "bank_account" TEXT,
    "booking_alerts" BOOLEAN NOT NULL DEFAULT true,
    "cancellation_alerts" BOOLEAN NOT NULL DEFAULT true,
    "payout_method" "PayoutMethod" NOT NULL DEFAULT 'UPI',
    "payout_frequency" TEXT NOT NULL DEFAULT 'MANUAL',
    "payout_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner-settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Auth_phone_key" ON "Auth"("phone");

-- CreateIndex
CREATE INDEX "Auth_phone_idx" ON "Auth"("phone");

-- CreateIndex
CREATE INDEX "Auth_role_idx" ON "Auth"("role");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_authId_key" ON "UserProfile"("authId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_email_key" ON "UserProfile"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerProfile_authId_key" ON "OwnerProfile"("authId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerProfile_email_key" ON "OwnerProfile"("email");

-- CreateIndex
CREATE INDEX "OwnerProfile_authId_idx" ON "OwnerProfile"("authId");

-- CreateIndex
CREATE INDEX "Turf_ownerProfileId_idx" ON "Turf"("ownerProfileId");

-- CreateIndex
CREATE INDEX "Turf_city_idx" ON "Turf"("city");

-- CreateIndex
CREATE INDEX "Turf_status_idx" ON "Turf"("status");

-- CreateIndex
CREATE INDEX "Turf_name_idx" ON "Turf"("name");

-- CreateIndex
CREATE INDEX "Turf_weekdayDayPrice_idx" ON "Turf"("weekdayDayPrice");

-- CreateIndex
CREATE INDEX "Turf_createdAt_idx" ON "Turf"("createdAt");

-- CreateIndex
CREATE INDEX "Turf_status_city_idx" ON "Turf"("status", "city");

-- CreateIndex
CREATE INDEX "Turf_status_sportsType_idx" ON "Turf"("status", "sportsType");

-- CreateIndex
CREATE INDEX "Turf_status_weekdayDayPrice_idx" ON "Turf"("status", "weekdayDayPrice");

-- CreateIndex
CREATE INDEX "Turf_status_city_sportsType_idx" ON "Turf"("status", "city", "sportsType");

-- CreateIndex
CREATE INDEX "Turf_status_city_weekdayDayPrice_idx" ON "Turf"("status", "city", "weekdayDayPrice");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_authId_key" ON "Payment"("authId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_userProfileId_key" ON "Payment"("userProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_ownerProfileId_key" ON "Payment"("ownerProfileId");

-- CreateIndex
CREATE INDEX "Payment_authId_idx" ON "Payment"("authId");

-- CreateIndex
CREATE INDEX "Payment_role_idx" ON "Payment"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_authId_idx" ON "Session"("authId");

-- CreateIndex
CREATE UNIQUE INDEX "OtpEntry_sessionToken_key" ON "OtpEntry"("sessionToken");

-- CreateIndex
CREATE INDEX "OtpEntry_sessionToken_idx" ON "OtpEntry"("sessionToken");

-- CreateIndex
CREATE INDEX "OtpEntry_authId_idx" ON "OtpEntry"("authId");

-- CreateIndex
CREATE INDEX "saved_turfs_user_id_idx" ON "saved_turfs"("user_id");

-- CreateIndex
CREATE INDEX "saved_turfs_turf_id_idx" ON "saved_turfs"("turf_id");

-- CreateIndex
CREATE INDEX "saved_turfs_user_id_created_at_idx" ON "saved_turfs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "saved_turfs_turf_id_user_id_idx" ON "saved_turfs"("turf_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_turfs_user_id_turf_id_key" ON "saved_turfs"("user_id", "turf_id");

-- CreateIndex
CREATE INDEX "bookings_user_id_idx" ON "bookings"("user_id");

-- CreateIndex
CREATE INDEX "bookings_turf_id_idx" ON "bookings"("turf_id");

-- CreateIndex
CREATE INDEX "bookings_booking_status_idx" ON "bookings"("booking_status");

-- CreateIndex
CREATE INDEX "bookings_booking_date_idx" ON "bookings"("booking_date");

-- CreateIndex
CREATE INDEX "bookings_payment_status_idx" ON "bookings"("payment_status");

-- CreateIndex
CREATE INDEX "bookings_user_id_booking_status_idx" ON "bookings"("user_id", "booking_status");

-- CreateIndex
CREATE INDEX "bookings_user_id_booking_date_idx" ON "bookings"("user_id", "booking_date");

-- CreateIndex
CREATE INDEX "bookings_turf_id_booking_date_idx" ON "bookings"("turf_id", "booking_date");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_turf_id_booking_date_start_time_key" ON "bookings"("turf_id", "booking_date", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "slot_locks_booking_id_key" ON "slot_locks"("booking_id");

-- CreateIndex
CREATE INDEX "slot_locks_turf_id_booking_date_idx" ON "slot_locks"("turf_id", "booking_date");

-- CreateIndex
CREATE INDEX "slot_locks_user_id_booking_date_idx" ON "slot_locks"("user_id", "booking_date");

-- CreateIndex
CREATE INDEX "slot_locks_booking_id_idx" ON "slot_locks"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "turf_ratings_booking_id_key" ON "turf_ratings"("booking_id");

-- CreateIndex
CREATE INDEX "turf_ratings_turf_id_idx" ON "turf_ratings"("turf_id");

-- CreateIndex
CREATE INDEX "turf_ratings_user_id_idx" ON "turf_ratings"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "turf_ratings_user_id_booking_id_key" ON "turf_ratings"("user_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_gamification_auth_id_key" ON "user_gamification"("auth_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_auth_id_key" ON "user_settings"("auth_id");

-- CreateIndex
CREATE INDEX "user_settings_auth_id_idx" ON "user_settings"("auth_id");

-- CreateIndex
CREATE UNIQUE INDEX "owner-settings_auth_id_key" ON "owner-settings"("auth_id");

-- CreateIndex
CREATE INDEX "owner-settings_auth_id_idx" ON "owner-settings"("auth_id");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerProfile" ADD CONSTRAINT "OwnerProfile_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turf" ADD CONSTRAINT "Turf_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "OwnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "OwnerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpEntry" ADD CONSTRAINT "OtpEntry_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_turfs" ADD CONSTRAINT "saved_turfs_turf_id_fkey" FOREIGN KEY ("turf_id") REFERENCES "Turf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_turfs" ADD CONSTRAINT "saved_turfs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_turf_id_fkey" FOREIGN KEY ("turf_id") REFERENCES "Turf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turf_ratings" ADD CONSTRAINT "turf_ratings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turf_ratings" ADD CONSTRAINT "turf_ratings_turf_id_fkey" FOREIGN KEY ("turf_id") REFERENCES "Turf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turf_ratings" ADD CONSTRAINT "turf_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_gamification" ADD CONSTRAINT "user_gamification_auth_id_fkey" FOREIGN KEY ("auth_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_auth_id_fkey" FOREIGN KEY ("auth_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner-settings" ADD CONSTRAINT "owner-settings_auth_id_fkey" FOREIGN KEY ("auth_id") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
