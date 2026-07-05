# Turfsy Backend Server

Scalable backend for Turfsy: auth, profiles, turf discovery, booking, payments, owner operations, analytics, settings, and gamification.

## Tech Stack

- NestJS + TypeScript
- PostgreSQL + Prisma
- JWT + OTP-based authentication
- Razorpay integration (orders + webhook verification)

## Core Functionality

- OTP login with role split (`USER` / `OWNER`)
- User + owner profile management
- Turf creation, search, filtering, and discovery feeds
- Slot-safe booking with payment lifecycle and webhook confirmation
- Booking history, invoices, rating, cancellations
- Owner operations (secure QR check-in verify, complete booking, reports)
- User settings + owner settings (separate production models)
- Owner analytics and owner home dashboard stats
- User gamification and leaderboards

## App Flows

### User Flow

1. Login with phone OTP
2. Create/update user profile (with preferred sport)
3. Browse home/discovery and turf listings
4. Save turfs
5. Create booking + create Razorpay order
6. Payment success via webhook confirms booking
7. Use booking (secure QR check-in flow), then rate turf
8. Use bookings/history/invoice/transactions
9. Manage user settings (payment, security, preferences, notifications)

### Owner Flow

1. Login with phone OTP
2. Create/update owner profile
3. Create/manage turfs
4. View owner bookings and filtered booking lists
5. Verify check-in PIN and complete bookings
6. Manage owner settings (profile, payment/payout, notifications, cancellation policy, support)
7. View owner analytics and owner home dashboard

## Endpoint Index (No Bodies)

Base API routes are listed exactly as implemented.

### System

- `GET /`
- `GET /health`
- `GET /api/v3/health`

### Auth (`/api/v3/auth`)

- `POST /api/v3/auth/user/login`
- `POST /api/v3/auth/owner/login`
- `POST /api/v3/auth/user/verify-otp`
- `POST /api/v3/auth/owner/verify-otp`
- `POST /api/v3/auth/user/resend-otp`
- `POST /api/v3/auth/owner/resend-otp`
- `GET /api/v3/auth/logout`
- `DELETE /api/v3/auth/delete-account`
- `GET /api/v3/auth/get-me`
- `POST /api/v3/auth/request-phone-change`
- `POST /api/v3/auth/verify-phone-change`

### User Profile (`/api/v3/user-profile`)

- `POST /api/v3/user-profile/`
- `GET /api/v3/user-profile/`
- `PATCH /api/v3/user-profile/`
- `POST /api/v3/user-profile/payment-details`
- `POST /api/v3/user-profile/location`
- `POST /api/v3/user-profile/upload-avatar`
- `DELETE /api/v3/user-profile/upload-avatar`

### Owner Profile (`/api/v3/ownerProfile`)

- `POST /api/v3/ownerProfile/`
- `GET /api/v3/ownerProfile/`
- `PATCH /api/v3/ownerProfile/`
- `POST /api/v3/ownerProfile/payment-details`

### Turfs (`/api/v3/turfs`)

- `POST /api/v3/turfs/`
- `GET /api/v3/turfs/`
- `GET /api/v3/turfs/nearby`
- `GET /api/v3/turfs/my`
- `GET /api/v3/turfs/search`
- `GET /api/v3/turfs/filter`
- `PATCH /api/v3/turfs/:turfId`
- `PATCH /api/v3/turfs/:turfId/status`
- `GET /api/v3/turfs/:turfId`
- `POST /api/v3/turfs/:turfId/images`
- `PATCH /api/v3/turfs/:turfId/upload-image/:type`

### User Home (`/api/v3/user-home`)

- `GET /api/v3/user-home/`
- `GET /api/v3/user-home/top-recommended`
- `GET /api/v3/user-home/most-rated`
- `GET /api/v3/user-home/budget-friendly`
- `GET /api/v3/user-home/nearby`
- `GET /api/v3/user-home/most-demanded`
- `GET /api/v3/user-home/newly-opened`
- `GET /api/v3/user-home/recently-viewed`

### Saved Turfs (`/api/v3/saved-turfs`)

- `POST /api/v3/saved-turfs/:turfId`
- `DELETE /api/v3/saved-turfs/:turfId`
- `GET /api/v3/saved-turfs/`

### Booking (`/api/v3/booking`)

- `POST /api/v3/booking/`
- `POST /api/v3/booking/:bookingId/create-order`
- `POST /api/v3/booking/:bookingId/confirm-payment`
- `POST /api/v3/booking/razorpay/webhook`
- `POST /api/v3/booking/:bookingId/payment-failed`
- `POST /api/v3/booking/verify-qr`
- `PATCH /api/v3/booking/:bookingId/complete`
- `GET /api/v3/booking/owner/bookings`
- `GET /api/v3/booking/owner/bookings-filtered`
- `GET /api/v3/booking/owner/bookings/:bookingId`
- `GET /api/v3/booking/owner/bookings/active`
- `GET /api/v3/booking/owner/analytics`
- `GET /api/v3/booking/owner/analytics/csv`
- `GET /api/v3/booking/owner/analytics/pdf`
- `PATCH /api/v3/booking/:bookingId/cancel`
- `POST /api/v3/booking/cron/no-shows`
- `POST /api/v3/booking/cron/auto-complete`
- `POST /api/v3/booking/my-bookings/:bookingId/rateTurf`
- `GET /api/v3/booking/my-bookings/active`
- `GET /api/v3/booking/my-bookings`
- `GET /api/v3/booking/my-bookings/bookings`
- `GET /api/v3/booking/transaction-history`
- `GET /api/v3/booking/my-bookings/:bookingId/invoice`
- `GET /api/v3/booking/my-bookings/:bookingId/invoice/pdf`
- `GET /api/v3/booking/my-bookings/:bookingId`
- `GET /api/v3/booking/availability/:turfId`

### User Settings (`/api/v3/user-settings`)

- `GET /api/v3/user-settings/payment`
- `PATCH /api/v3/user-settings/payment`
- `POST /api/v3/user-settings/change-password`
- `POST /api/v3/user-settings/change-phone`
- `GET /api/v3/user-settings/preferences`
- `PATCH /api/v3/user-settings/preferences`
- `GET /api/v3/user-settings/notifications`
- `PATCH /api/v3/user-settings/notifications`

### Owner Settings (`/api/v3/owner-settings`)

- `GET /api/v3/owner-settings/profile`
- `PATCH /api/v3/owner-settings/profile`
- `GET /api/v3/owner-settings/turf/:turfId`
- `PATCH /api/v3/owner-settings/turf/:turfId`
- `GET /api/v3/owner-settings/payment`
- `PATCH /api/v3/owner-settings/payment`
- `GET /api/v3/owner-settings/payout`
- `PATCH /api/v3/owner-settings/payout`
- `GET /api/v3/owner-settings/notifications`
- `PATCH /api/v3/owner-settings/notifications`
- `GET /api/v3/owner-settings/cancellation-policy/:turfId`
- `PATCH /api/v3/owner-settings/cancellation-policy/:turfId`
- `POST /api/v3/owner-settings/change-password`
- `GET /api/v3/owner-settings/support`
- `POST /api/v3/owner-settings/logout`

### Owner Analytics (`/owner-analytics`)

- `GET /owner-analytics/overall`
- `GET /owner-analytics/total-revenue`
- `GET /owner-analytics/total-bookings`
- `GET /owner-analytics/completed-bookings`
- `GET /owner-analytics/cancelled-bookings`
- `GET /owner-analytics/revenue-by-date`
- `GET /owner-analytics/bookings-by-date`
- `GET /owner-analytics/cash-vs-online`
- `GET /owner-analytics/peak-hours`
- `GET /owner-analytics/cancellation-rate`
- `GET /owner-analytics/no-show-rate`

### Owner Home (`/owner-home`)

- `GET /owner-home/dashboard`
- `GET /owner-home/revenue-summary`
- `GET /owner-home/booking-statistics`
- `GET /owner-home/recent-activity`
- `GET /owner-home/trends`
- `GET /owner-home/payment-distribution`
- `GET /owner-home/turf-performance`

### User Gamification (`/api/v3/user-gamification`)

- `GET /api/v3/user-gamification/overall`
- `GET /api/v3/user-gamification/streak`
- `GET /api/v3/user-gamification/nudge`
- `GET /api/v3/user-gamification/leaderboard`
- `GET /api/v3/user-gamification/leaderboard/points`
- `GET /api/v3/user-gamification/leaderboard/total-matches-played`
- `GET /api/v3/user-gamification/leaderboard/total-hours-played`
- `POST /api/v3/user-gamification/debug/trigger-completion/:bookingId`

## Notes

- `/health` and `/api/v3/health` return grouped module + endpoint count status.
- Detailed payload examples remain in `/docs/*.md`.
- Owner settings payment/payout uses dedicated `owner-settings` model.
