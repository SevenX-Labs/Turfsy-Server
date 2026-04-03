# Turfsy Backend Server

A robust, scalable backend for the Turfsy Application — a platform connecting Turf Owners with Sports Enthusiasts for turf discovery and booking management. 

---

## 🚀 Tech Stack
* **Framework**: NestJS (Node.js)
* **Language**: TypeScript
* **Database**: PostgreSQL (hosted on Supabase)
* **ORM**: Prisma
* **Authentication**: Custom OTP-based Authentication with JWT Tokens
* **Storage**: Fast/Secure Cloud Storage for image uploads

---

## 📁 Folder Structure

```text
src/
 ├── prisma/                 # Global Prisma Client and connections
 ├── modules/                # Enterprise scoped feature modules
 │   ├── auth/               # OTP, Sessions, JWT, Role Selection
 │   ├── user-profile/       # Customer profiles 
 │   ├── owner-profile/      # Turf Owner profiles & KYC
 │   ├── upload/             # Global file handling
 │   ├── turfs/              # CRUD Turfs, Pricing, Timings
 │   ├── user-home/          # Nearby & Popular feeds
 │   ├── saved-turfs/        # Bookmarking logic
 │   └── booking/            # Creation, Payments, Overlaps, Cancels
 ├── app.module.ts           # Root module mapping
 └── main.ts                 # NestJS bootstrap
```

---

## ✅ What is Done (Implemented Features)

### 1. Unified Authentication
- Password-less OTP authentication.
- Single login splits into `USER` or `OWNER` workspaces via secure Role Selection.
- JWT Access & Session Tokens.

### 2. Multi-tenant Profiles
- Complete Customer profiles (Name, Email, Phone linked).
- Complete Owner profiles (Name, Email, Emergency Contacts, KYC details).

### 3. Turf Management (Owner Side)
- Post new Turfs with multiple images, geo-location mapping, and operational hours.
- Set complex pricing templates (Weekday/Weekend + Day/Night differentiation).
- Toggle turf status (`ACTIVE`, `INACTIVE`, `MAINTENANCE`).

### 4. Discovery & Search (Customer Side)
- **Home Feed**: Nearby algorithms, popular algorithms, fetch by Sports Type.
- **Search System**: Multi-faceted filter sorting by price (Low to High), ratings, and exact names/cities.
- **Saved Turfs**: Bookmark and retrieve favorite turfs effortlessly.

### 5. Production-Grade Booking Engine
- **Slot Architecture**: Prevent double bookings using strict overlapping validations (`openTimes` & `closeTimes` strict barriers).
- **Payment Lifecycle**: 
  - **Check-in Security**: A secure 4-digit PIN is generated universally for BOTH `CASH` and `ONLINE` workflows to verify user arrivals seamlessly.
  - Supports `CASH` (Collect 50% deposit via online, the remaining collected offline natively verified via check-in PIN).
  - Supports `ONLINE` (Fully atomic operations locking bookings behind Razorpay signature verifications).
- **Cancellation**: Smart cancellation handling (Automatic full refunds if cancelled $\ge$ 2 hours before slot, no refunds if cancelled late).
- **Invoicing & History**: Dedicated transaction tracking, invoice generation, and post-visit review system.

### 6. Production Resilience & Infrastructure
- **Connection Rotation**: Advanced `pg` connection configurations leveraging TCP Keep-Alive parameters to bypass Supabase / Supavisor idle drop timeouts.
- **Client Deployment**: Locked down Prisma `v7` constructor configuration securely integrated inside NestJS Dependency Injection.

---

## 🌊 Overall Project Flow

### Customer Flow:
1. `Login` using phone.
2. `Verify OTP`, select Role=`USER`.
3. Fill `User Profile`.
4. Browse Home Page (`Nearby`, `Popular`).
5. `Search & Filter` for turfs.
6. `Save` favorite turfs for later.
7. Click `Book Now` on a Turf → Select `Date` & `Duration (hours)`.
8. Check `Live Slots Availability` — UI visually marks booked/overlapping clusters in RED and available in GREEN. 
9. `Select an Available Slot` and initiate Payment (`ONLINE/CASH`).
10. Show generated PIN at owner's desk (if CASH) $\to$ Visit Complete.
11. `Rate Turf` post-visit check.

### Owner Flow:
1. `Login` using phone $\to$ Role=`OWNER`.
2. Fill `Owner Profile`.
3. Target `Turf Creation` $\to$ Upload multiple images $\to$ Define pricing & times.
4. Dashboard to manage turf availability.
5. `Verify PIN` $\to$ Approves user check-ins securely.

---

## 📖 Testing & Documentation Redirects

If you need the **exact JSON Request bodies & JSON Responses** for testing via Postman, please refer to the extremely detailed markdown files existing in the `/docs` folder:

* `docs/auth_readme.md`
* `docs/userProfile_creation_readme.md`
* `docs/ownerProfile_creation_readme.md`
* `docs/turf_creation_readme.md`
* `docs/user_home_readme.md`
* `docs/search-filter-turfs_readme.md`
* `docs/saved-turfs_readme.md`
* `docs/custoner_booking_api_readme.md`

---

## ⚡ LINE-BY-LINE ENDPOINT LIST

*(All routes are prefixed with `/api/v3/`)*

### 🔐 Authentication
* `POST   /auth/login` - Initiate OTP
* `POST   /auth/verify-otp` - Validate OTP returns Access Token
* `POST   /auth/select-role` - Split accounts into USER/OWNER
* `POST   /auth/resend-otp` - Trigger rapid OTP resend
* `GET    /auth/get-me` - Get current session details
* `GET    /auth/logout` - Clear sessions
* `DELETE /auth/delete-account` - Erase account

### 👥 Profiles
* `POST   /user/profile` - Create User Profile
* `PATCH  /user/profile` - Update User Profile
* `GET    /user/profile/:id` - Fetch User Profile
* `POST   /owner/profile` - Create Owner Profile
* `PATCH  /owner/profile` - Update Owner Profile
* `GET    /owner/profile/:id` - Fetch Owner Profile

### 📤 Global Upload
* `POST   /upload` - Secure multipart file upload via Interceptors

### 🏟️ Turf Management (Owners)
* `POST   /turfs` - Create a new Turf location
* `GET    /turfs` - List all turfs owned by this session
* `GET    /turfs/:id` - View single turf by Owner
* `PATCH  /turfs/:id` - Edit specific turf
* `PATCH  /turfs/:id/status` - Change ACTIVE/INACTIVE state
* `DELETE /turfs/:id` - Delete Turf

### 🔍 Discovery & Feed (Customers)
* `GET    /user-home/nearby` - Sort existing turfs by spatial proximity
* `GET    /user-home/popular` - Highest rated and most booked
* `GET    /user-home/sports` - Categories breakdown
* `GET    /turfs/search` - Comprehensive Filter API (`?query=&city=&rating=&sortPrice=asc`)

### ❤️ Bookmarks
* `POST   /saved-turfs/:turfId` - Toggle Bookmark (Save / Unsave)
* `GET    /saved-turfs` - Get list of saved turfs

### 📅 Booking Engine
* `GET    /booking/availability/:turfId?date=YYYY-MM-DD` - Fetch all booked overlapping slots 
* `POST   /booking` - Create booking intent
* `POST   /booking/:bookingId/confirm-payment` - Confirms Razorpay success
* `POST   /booking/:bookingId/payment-failed` - Auto cancel pending payment
* `POST   /booking/:bookingId/verify-pin` - Verify Check-in (OWNER executes)
* `PATCH  /booking/:bookingId/complete` - Mark visit success manually (OWNER executes)
* `PATCH  /booking/:bookingId/cancel` - Cancel booking and trigger 2-hour refund logic
* `POST   /booking/my-bookings/:bookingId/rateTurf` - Add rating post-checkout
* `GET    /booking/my-bookings` - Complete user booking history
* `GET    /booking/my-bookings/:bookingId` - View specific booking invoice details
* `GET    /booking/my-bookings/bookings?status=&filter=` - Filtered queries (Upcoming/Past/Today)
* `GET    /booking/my-bookings/:bookingId/invoice` - Render structured invoice data
* `GET    /booking/transaction-history` - Render isolated financial logs

---

## 🛡️ Production & Security Layers Implemented

### 💳 12-Layer Payment Security Architecture
1. **JWT Authentication & RBAC**: Strict verification. `Owner` endpoints are fully isolated, turf-ownership is verified per request.
2. **Idempotency Engine**: Prevents double-charging, duplicate Razorpay orders, and redundant ratings or refunds.
3. **Signature Verification (Timing-Safe)**: Validates `razorpay_signature` using strict `crypto.timingSafeEqual` to defeat timing attacks and tampering.
4. **Amount Integrity Control**: Prices are evaluated entirely on the server-side (`depositAmount`) based on complex (day/night/weekend) rules. Fetches Razorpay Order API to guarantee amount match.
5. **Strict State Machine Transitions**: Ensures bookings flawlessly move from `PENDING` $\to$ `CONFIRMED` $\to$ `COMPLETED` (or `CANCELLED`/`REFUNDED`).
6. **In-Memory Rate Limiting**: Distributed hit-counters for intensive routes (`create-booking`, `verify-pin`, `cancel`) mapping dynamically to User IDs or IPs.
7. **Race Condition Prevention**: Prevents parallel overlapping bookings globally utilizing raw PostgreSQL `$transaction` wrapped with locking `FOR UPDATE` queries.
8. **Constant-Time PIN Verification & Lockouts**: Generates PINs using `crypto.randomInt`. 5 consecutive failed `checkInPin` attempts places a total DB lockdown (`HTTP 423 Locked`).
9. **Safe Cloud Refund Orchestration**: Razorpay `payments.refund()` triggers immediately upon cancellation (strictly capturing the 75% refund parameter). Database transforms to `REFUNDED` only when Razorpay acknowledges success.
10. **Input Sanitization & Constraints (DTOs)**: Strips malicious HTML via class-transform. Defends against malformed duration inputs mapping strict 30-minute block logic.
11. **Internal Response Data Masking**: Cleans output payloads globally globally via NestJS Interceptors to permanently mask internal IDs, `checkInPin` sequences in list-apis, and prevents DB error leaks via filters. 
12. **Forensic Audit Logging**: Centralized logging mapping all payment workflows internally (`pay_*****`). Includes critical discord/slack capable alarms (`Logger.alert`) on tampered payloads or signature mismatch.

### ⏳ Smart Authentication Expiry Rules
* **90-Day Absolute JWT Lifespan**: Access Tokens strictly perish on their 90th day.
* **30-Day Rolling Inactivity Timeout**: The database session slides its expiration tracking dynamically. If a user does not open the app for 1 straight month, the session permanently revokes itself seamlessly, forcing a manual re-authentication drop.

---
