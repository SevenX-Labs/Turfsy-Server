# Turfsy API Design Document

This document provides a technical specification of the RESTful API endpoints available in the Turfsy server platform (`v3`). It covers request structures, response formats, HTTP status codes, authorization requirements, validation DTOs, and error handling behaviors.

---

## 1. Global Configurations & Standards

### Base Configuration
*   **Base URL**: `http://localhost:3000` (Local) / `https://api.turfsy.com` (Production)
*   **API Prefix**: `/api/v3`
*   **Default Format**: `application/json` (unless specified as `multipart/form-data`)

### Global HTTP Status Codes
*   `200 OK`: Request succeeded. Returns data payload.
*   `201 Created`: Resource successfully generated (e.g., login, profile creation, booking).
*   `400 Bad Request`: Validation failure or malformed payload.
*   `401 Unauthorized`: Missing, expired, or invalid JWT Bearer token.
*   `403 Forbidden`: Token is valid, but user role (USER vs. OWNER) lacks access.
*   `404 Not Found`: Target resource (turf ID, booking ID, player username) does not exist.
*   `429 Too Many Requests`: Triggered by rate-limiter guards.

---

## 2. Authentication Module (`/auth`)

Handles phone-based OTP registration, token validation, refresh cycles, and profile status lookups.

### 1. User Login (Send OTP)
Initiates the user authentication flow by dispatching an SMS OTP.
*   **Method**: `POST`
*   **Endpoint**: `/auth/user/login`
*   **Headers**: None
*   **Request Body**:
    ```json
    {
      "phone": "9876543210"
    }
    ```
*   **Validation Rules**:
    *   `phone`: Must be a valid Indian mobile number (10 digits).
*   **Response (201 Created)**:
    ```json
    {
      "success": true,
      "message": "OTP sent successfully",
      "expiresIn": 60
    }
    ```

### 2. User OTP Verification
Verifies the SMS OTP and generates access tokens.
*   **Method**: `POST`
*   **Endpoint**: `/auth/user/verify-otp`
*   **Request Body**:
    ```json
    {
      "phone": "9876543210",
      "otp": "123456"
    }
    ```
*   **Validation Rules**:
    *   `otp`: Must be exactly 6 characters.
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "message": "OTP verified successfully",
      "accessToken": "eyJhbGciOi...",
      "role": "USER",
      "isNewUser": true,
      "auth": {
        "id": "auth-uuid-123",
        "phone": "9876543210",
        "role": "USER"
      }
    }
    ```

### 3. Owner Login (Send OTP)
*   **Method**: `POST`
*   **Endpoint**: `/auth/owner/login`
*   **Request Body**: Identical to user login.

### 4. Owner OTP Verification
*   **Method**: `POST`
*   **Endpoint**: `/auth/owner/verify-otp`
*   **Response (200 OK)**: Returns tokens with `role: "OWNER"`.

### 5. Fetch Session Context
Retrieves account profiles and authorization claims.
*   **Method**: `GET`
*   **Endpoint**: `/auth/get-me`
*   **Headers**: `Authorization: Bearer <accessToken>`
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "id": "auth-uuid-123",
        "phone": "9876543210",
        "role": "USER",
        "isVerified": true,
        "isActive": true,
        "profile": {
          "id": "profile-uuid-456",
          "username": "sahil_hode",
          "name": "Sahil Hode",
          "email": "sahil@example.com"
        },
        "payment": null
      }
    }
    ```

---

## 3. Player Profile Module (`/user-profile`)

Manages customer credentials, GPS positions, avatar streams, and payment preferences.

### 1. Check Username Availability
*   **Method**: `GET`
*   **Endpoint**: `/user-profile/check-availability`
*   **Query Params**: `username` (e.g., `john_doe`)
*   **Response (200 OK - Available)**:
    ```json
    {
      "available": true,
      "message": "Username is available"
    }
    ```

### 2. Create User Profile
*   **Method**: `POST`
*   **Endpoint**: `/user-profile`
*   **Headers**: `Authorization: Bearer <accessToken>`
*   **Request Body**:
    ```json
    {
      "username": "john_doe",
      "name": "John Doe",
      "email": "john@example.com",
      "dob": "2000-01-15",
      "gender": "MALE",
      "preferredSport": "CRICKET",
      "currentLat": 19.076,
      "currentLng": 72.8777,
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001"
    }
    ```
*   **Response (21 Created)**:
    ```json
    {
      "success": true,
      "message": "Profile created successfully",
      "data": {
        "id": "profile-uuid-999",
        "username": "john_doe",
        "name": "John Doe"
      }
    }
    ```

### 3. Update Detailed Address
Updates coordinates and address descriptions.
*   **Method**: `PATCH`
*   **Endpoint**: `/user-profile/address`
*   **Request Body**:
    ```json
    {
      "houseNumber": "C-101",
      "societyName": "Green Valley",
      "landmark": "Opposite Sports Club",
      "roadName": "Link Road"
    }
    ```
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "message": "Address updated successfully"
    }
    ```
    *   *Note: Backend concatenates fields to update the main `address` record.*

### 4. Upload Avatar Image
*   **Method**: `POST`
*   **Endpoint**: `/user-profile/upload-avatar`
*   **Headers**: `Content-Type: multipart/form-data`
*   **Form Data**: `file` (Binary image stream)
*   **Response (201 Created)**:
    ```json
    {
      "success": true,
      "avatarUrl": "https://supabase-storage-url/uploads/avatars/uuid.jpg"
    }
    ```

---

## 4. Owner & Business Profile Module (`/ownerProfile`)

Manages turf owner accounts, business information, and payout settings.

### 1. Register Owner Profile
*   **Method**: `POST`
*   **Endpoint**: `/ownerProfile`
*   **Request Body**:
    ```json
    {
      "name": "Rahul Shah",
      "email": "rahul@example.com",
      "contactNumber": "9876543210"
    }
    ```
*   **Validation Rules**:
    *   `contactNumber`: Must match the verified login phone number.
*   **Response (201 Created)**:
    ```json
    {
      "success": true,
      "message": "Owner profile created successfully"
    }
    ```

### 2. Update Business & Payout Settings
*   **Method**: `PATCH`
*   **Endpoint**: `/ownerProfile`
*   **Request Body**:
    ```json
    {
      "name": "Jane Owner",
      "email": "jane@turfsy.com",
      "bankHolderName": "Jane Owner",
      "bankName": "HDFC Bank",
      "accountNumber": "50100123456789",
      "ifscCode": "HDFC0001234",
      "upiId": "jane.owner@okhdfc"
    }
    ```
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "message": "Owner profile updated successfully"
    }
    ```

---

## 5. Turf Listing & Discovery Module (`/turfs`)

Manages turf information, pricing settings, and search operations.

### 1. Create Turf Listing
*   **Method**: `POST`
*   **Endpoint**: `/turfs`
*   **Headers**: `Content-Type: multipart/form-data`
*   **Form Data Fields**:
    *   `name`: "Super Arena"
    *   `sportsType`: "FOOTBALL"
    *   `turfSize`: "5v5"
    *   `address`: "123 Main St"
    *   `city`: "Mumbai"
    *   `pincode`: "400001"
    *   `lat`: 19.0760
    *   `lng`: 72.8777
    *   `openTime`: "06:00"
    *   `closeTime`: "23:00"
    *   `minSlotDurationMins`: 60
    *   `weekdayDayPrice`: 1000
    *   `weekdayNightPrice`: 1200
    *   `weekendDayPrice`: 1500
    *   `weekendNightPrice`: 1800
    *   `entrance` (File, Optional)
    *   `dayTurf` (File, Optional)
    *   `nightTurf` (File, Optional)
*   **Response (201 Created)**:
    ```json
    {
      "success": true,
      "data": {
        "id": "turf-uuid-111",
        "name": "Super Arena"
      }
    }
    ```

### 2. Search Turf listings
*   **Method**: `GET`
*   **Endpoint**: `/turfs/search`
*   **Query Params**: `q` (Search keyword, e.g., `kickoff`)
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "count": 1,
      "data": [
        {
          "id": "turf-uuid-111",
          "name": "Kickoff Arena",
          "sportsType": "FOOTBALL",
          "city": "Mumbai",
          "weekdayDayPrice": 1200
        }
      ]
    }
    ```

### 3. Filter and Sort listings
*   **Method**: `GET`
*   **Endpoint**: `/turfs/filter`
*   **Query Params**: `city`, `sportsType`, `minPrice`, `maxPrice`, `sortBy`, `userLat`, `userLng`
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": [
        {
          "id": "turf-uuid-111",
          "name": "Champions Turf",
          "distanceKm": 3.4,
          "rating": 4.5,
          "images": [
            "https://supabase-url/entrance.jpg"
          ]
        }
      ]
    }
    ```

---

## 6. Booking & Payments Module (`/booking`)

Manages booking reservations, payment processing, check-ins, and cost splitting.

### 1. Get Slot Availability
*   **Method**: `GET`
*   **Endpoint**: `/booking/availability/:turfId`
*   **Query Params**: `date` (format: `YYYY-MM-DD`, e.g., `2026-07-05`)
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "openTime": "06:00",
        "closeTime": "23:00",
        "bookedSlots": [
          { "startTime": "18:00", "endTime": "19:00" }
        ],
        "pricing": {
          "dayPrice": 1000,
          "nightPrice": 1200,
          "nightStartsAt": "18:00",
          "isWeekend": false
        }
      }
    }
    ```

### 2. Create Booking (Initialize Lock)
*   **Method**: `POST`
*   **Endpoint**: `/booking`
*   **Request Body**:
    ```json
    {
      "turfId": "turf-uuid-111",
      "bookingDate": "2026-07-05",
      "startTime": "19:00",
      "endTime": "20:00",
      "durationMins": 60,
      "paymentType": "HALF_ONLINE_HALF_CASH",
      "notes": "Need referee bibs",
      "playersCount": 10
    }
    ```
*   **Response (201 Created)**:
    ```json
    {
      "success": true,
      "message": "Booking created. Complete payment to confirm.",
      "data": {
        "id": "booking-uuid-777",
        "bookingStatus": "PENDING",
        "amount": 1200,
        "depositAmount": 600,
        "amountToPay": 600,
        "remainingAmount": 600,
        "checkInPin": "9081"
      }
    }
    ```

### 3. Generate Razorpay Payment Order
*   **Method**: `POST`
*   **Endpoint**: `/booking/:bookingId/create-order`
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "orderId": "order_Hj29Ksk",
        "amount": 60000,
        "currency": "INR",
        "keyId": "rzp_test_key"
      }
    }
    ```

### 4. Confirm Payment
*   **Method**: `POST`
*   **Endpoint**: `/booking/:bookingId/confirm-payment`
*   **Request Body**:
    ```json
    {
      "razorpayOrderId": "order_Hj29Ksk",
      "razorpayPaymentId": "pay_982Ksk",
      "razorpaySignature": "sig_82ks9sk2js9s"
    }
    ```
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "message": "Payment verified and booking confirmed"
    }
    ```

---

## 7. Cost Splitting Module (`/booking/:bookingId/split`)

Manages teammate contributions for group bookings.

### 1. Initialize & Retrieve Split Ledger
*   **Method**: `GET`
*   **Endpoint**: `/booking/:bookingId/split`
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "id": "split-uuid-888",
        "totalAmount": 1200,
        "isSplitDone": false,
        "players": [
          {
            "id": "player-uuid-999",
            "username": "john_doe",
            "amount": 1200,
            "status": "PENDING"
          }
        ]
      }
    }
    ```

### 2. Add Teammates to Split
*   **Method**: `POST`
*   **Endpoint**: `/booking/:bookingId/split/players`
*   **Request Body**:
    ```json
    {
      "usernames": ["player_a", "player_b"]
    }
    ```
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "message": "Players added to split. Amounts updated."
    }
    ```

### 3. Finalize & Lock Split Config
*   **Method**: `POST`
*   **Endpoint**: `/booking/:bookingId/split/trigger`
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "message": "Split triggered and finalized."
    }
    ```

---

## 8. Gamification Module (`/user-gamification`)

Tracks customer XP, booking streaks, and leaderboard rankings.

### 1. Fetch Gamification Summary
*   **Method**: `GET`
*   **Endpoint**: `/user-gamification/overall`
*   **Response (200 OK)**:
    ```json
    {
      "streak": 4,
      "points": 240,
      "leaderboard": {
        "top10": [
          { "name": "Rajesh Kumar", "points": 950 },
          { "name": "Amit Patel", "points": 880 }
        ],
        "currentUser": {
          "rank": 14,
          "name": "You",
          "points": 240
        }
      },
      "nudge": "Book a match today to extend your streak!"
    }
    ```

---

## 9. Owner Analytics Module (`/owner-home` & `/owner-analytics`)

Retrieves revenue statistics and business metrics for turf owners.

### 1. Fetch Dashboard Overview
*   **Method**: `GET`
*   **Endpoint**: `/owner-home/dashboard`
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "summary": {
          "revenue": { "today": 4500, "month": 92000, "overall": 540000 },
          "counts": { "total": 84, "today": 6, "upcoming": 2 }
        },
        "trends": {
          "peakHour": "19:00",
          "mostBookedTurf": "Champs Pitch"
        }
      }
    }
    ```

### 2. Verify Customer Check-in PIN
Validates the customer PIN to settle bookings at the turf.
*   **Method**: `POST`
*   **Endpoint**: `/booking/:bookingId/verify-pin`
*   **Request Body**:
    ```json
    {
      "pin": "9081"
    }
    ```
*   **Response (200 OK)**:
    ```json
    {
      "success": true,
      "message": "PIN verified. Booking marked as COMPLETED."
    }
    ```
