# Turfsy Booking API Documentation

Base URL: `/api/v3/booking`  
**All endpoints require JWT** → `Authorization: Bearer <token>`

---

## 📌 BOOKING FLOW (Read this first)

### 1. Unified Payment Flow (ONLINE & CASH)
```text
Turf Page -> User clicks "Book Now"
   ↓
Select Date & Duration (e.g., 2 hours)
   ↓
Call GET /availability/:turfId
(UI displays available Green slots and the dynamic price for that day/time)
   ↓
User selects an Available Time Slot
   ↓
Create Booking (POST /api/v3/booking)
(No amount passed! Backend automatically calculates price based on Turf's day/night + weekday/weekend rules)
   ↓
API returns 'amountToPay' (100% for ONLINE, 50% deposit for CASH)
   ↓
Create Order (POST .../create-order) -> Gets Razorpay order ID
   ↓
User pays via Razorpay Gateway (Web/App UI)
   ↓
Confirm Payment (POST .../confirm-payment with signature)
   ↓
   ├── Payment SUCCESS
   │    └── bookingStatus = CONFIRMED
   │    └── paymentStatus = SUCCESS (ONLINE) / PENDING (CASH - remaining 50% paid at turf)
   │
   └── Payment FAILED
        └── bookingStatus = CANCELLED
        └── paymentStatus = FAILED
```

### 2. Visit & Verification
```text
CASH Booking:
Booking Confirmed -> 4-digit checkInPin Generated (e.g. 4821)
User arrives at Turf -> Shows PIN -> Pays remaining 50%
Owner verifies PIN -> Booking marked as COMPLETED
(See Owner API documentation for verification endpoints)
```

### 3. Cancellation & No-Show Rules
1. **Cancellation (≥ 2 hours before start):**
   - User is allowed to cancel via `PATCH .../cancel`.
   - **75% Refund** of whatever online amount was paid (`depositAmount`).
   - bookingStatus = `CANCELLED`, paymentStatus = `REFUNDED`.
2. **Cancellation (< 2 hours before start):**
   - API blocks cancellation (`400 Bad Request`). User cannot cancel.
3. **No-Show Tracking (Cron):**
   - If user doesn't check in within 15 minutes of slot start time, system auto-marks as `NO_SHOW`.
   - Deposit is forfeited (no refund).

### State Summary

| bookingStatus | Meaning |
|--------------|---------|
| `PENDING` | Created, waiting for online payment |
| `CONFIRMED` | Payment done (online) OR auto-confirmed (cash) |
| `COMPLETED` | User visited the turf |
| `CANCELLED` | Cancelled by user or payment failed |

| paymentStatus | Meaning |
|--------------|---------|
| `PENDING` | Awaiting payment |
| `SUCCESS` | Payment received |
| `FAILED` | Payment failed |
| `REFUNDED` | Refund processed |

---

## 📋 API ENDPOINTS

---

---

### 1. Get Turf Availability (Booked Slots)
```
GET /api/v3/booking/availability/:turfId?date=2026-04-05
```

**Description:** Call this before creating a booking to show available/unavailable slots to the user in the UI.

**Response:**
```json
{
  "success": true,
  "data": {
    "openTime": "06:00",
    "closeTime": "23:00",
    "bookedSlots": [
      {
        "startTime": "14:00",
        "endTime": "15:00"
      }
    ],
    "pricing": {
      "dayPrice": 1200,
      "nightPrice": 1500,
      "nightStartsAt": "18:00",
      "isWeekend": false
    }
  }
}
```

---

### 2. Create Booking
```
POST /api/v3/booking
```

**Request Body:**
```json
{
  "turfId": "a6c1edc8-a5b8-4966-8660-5b6a5d2751b0",
  "bookingDate": "2026-04-05",
  "startTime": "14:00",
  "endTime": "15:00",
  "durationMins": 60,
  "paymentType": "ONLINE",
  "notes": "Need extra footballs",
  "playersCount": 12
}
```

> **Validation Logic**: The API prevents partial and full overlaps. If a user tries to book `08:00 - 10:00` and someone has already booked `09:00 - 10:00`, it will return a `400 Bad Request` saying the slot overlaps with an existing booking.

**Response (ONLINE):**
```json
{
  "success": true,
  "message": "Booking created. Complete payment to confirm.",
  "data": {
    "id": "booking-uuid",
    "displayId": "TRF-A6C1EDC",
    "userId": "auth-uuid",
    "turfId": "turf-uuid",
    "bookingDate": "2026-04-05T00:00:00.000Z",
    "startTime": "14:00",
    "endTime": "15:00",
    "durationMins": 60,
    "bookingStatus": "PENDING",
    "paymentStatus": "PENDING",
    "paymentType": "ONLINE",
    "amount": 1200,
    "depositAmount": 1200,
    "amountToPay": 1200,
    "remainingAmount": 0,
    "checkInPin": null,
    "createdAt": "2026-04-02T10:30:00.000Z"
  }
}
```

**Response (CASH) — same body but `paymentType: "CASH"`:**
```json
{
  "success": true,
  "message": "Booking created. Pay 50% deposit (₹600) online. Remaining ₹600 at turf.",
  "data": {
    "id": "booking-uuid",
    "displayId": "TRF-A6C1EDC",
    "bookingStatus": "PENDING",
    "paymentStatus": "PENDING",
    "paymentType": "CASH",
    "checkInPin": "4821",
    "pinExpiresAt": "2026-04-05T15:00:00.000Z",
    "amount": 1200,
    "depositAmount": 600,
    "amountToPay": 600,
    "remainingAmount": 600
  }
}
```

---

### Slot Lock Flow (Server-controlled)

This secondary layer sits between the “Book Now” tap and Razorpay payment so the backend is always in control of every slot.

1. **Pre-flight lock check:** Before creating a booking entry we delete expired locks and inspect any live lock for the same turf/date with `startTime < requestedEndTime` and `endTime > requestedStartTime`. If someone else holds that lock, return `400` with “Slot is being booked.” If the same user already owns the exact slot, the lock is refreshed for another 5 minutes so retries succeed.
2. **Create lock:** When no competing lock exists, insert a `slot_lock` row (turf/date/time/user) with `expiresAt = now + 5 minutes`. This reserves the slot while the user completes payment.
3. **Create booking:** The existing booking transaction runs (`PENDING`, server-side amount, row-level locking) and links the new booking to the lock.
4. **Payment outcome handling:**
   * **Success** (Razorpay webhook or confirm-payment) → verify Razorpay, update the booking to `CONFIRMED`, then delete the lock.
   * **Failure** → cancel the booking (`CANCELLED`, `paymentStatus = FAILED`) and delete the lock immediately.
   * **No action** → the lock simply expires after 5 minutes and the slot becomes free again.

Race-safety rules:
* Locks cover only the requested slot, not the whole turf.
* Overlaps use `newStart < existingEnd && newEnd > existingStart`.
* The backend enforces every rule; the frontend is never trusted.

> **One-line summary:** Lock before payment, confirm after webhook, auto-release if abandoned.

### 2.5 Create Razorpay Order
```
POST /api/v3/booking/:bookingId/create-order
```
**Description:** Initializes a secure server-side Razorpay order using the `depositAmount`.

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "order_PqR1234567890",
    "amount": 120000, 
    "currency": "INR",
    "bookingId": "booking-uuid",
    "displayId": "TRF-A6C1EDC",
    "keyId": "rzp_test_xxxxxx"
  }
}
```
*(Note: `amount` returned here is in Paise! 120000 paise = 1200 INR)*

---

### 3. Confirm Online Payment
```
POST /api/v3/booking/:bookingId/confirm-payment
```

**Request Body:**
```json
{
  "razorpayOrderId": "order_PqR1234567890",
  "razorpayPaymentId": "pay_AbC9876543210",
  "razorpaySignature": "df45ecba987..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment successful. Booking confirmed!",
  "data": {
    "id": "booking-uuid",
    "displayId": "TRF-A6C1EDC",
    "bookingStatus": "CONFIRMED",
    "paymentStatus": "SUCCESS",
    "razorpayOrderId": "order_PqR1234567890",
    "razorpayPaymentId": "pay_AbC9876543210"
  }
}
```

---

### 3.1 Razorpay Server Webhook
```
POST /api/v3/booking/razorpay/webhook
```

Razorpay can directly confirm the backend when a payment is captured. Configure this endpoint in the Razorpay Dashboard with method `POST` and the appropriate webhook secret (set `RAZORPAY_WEBHOOK_SECRET` or fall back to `RAZORPAY_KEY_SECRET` in the environment). The endpoint expects the raw JSON payload and the `x-razorpay-signature` header; the server verifies the HMAC-SHA256 signature, validates the Razorpay order amount, and moves the associated booking from `PENDING` to `CONFIRMED` using the stored `razorpayOrderId` or the booking metadata (`notes.bookingId`).

Only `payment.captured` (and `order.paid`) events are processed. Other events always return `200 OK` with a short message, while invalid signatures or missing bookings return `4xx` so Razorpay retries and alerts you.

```json
{
  "success": true,
  "message": "Razorpay webhook processed."
}
```

---

### 4. Payment Failed
```
POST /api/v3/booking/:bookingId/payment-failed
```

**Request Body:** None

**Response:**
```json
{
  "success": true,
  "message": "Payment failed. Booking cancelled.",
  "data": {
    "id": "booking-uuid",
    "bookingStatus": "CANCELLED",
    "paymentStatus": "FAILED"
  }
}
```

---



### 7. Cancel Booking
```
PATCH /api/v3/booking/:bookingId/cancel
```

**Request Body:**
```json
{
  "reason": "Change of plans"
}
```

**Response (refund — cancelled ≥ 2hr before):**
```json
{
  "success": true,
  "message": "Booking cancelled. Refund will be processed.",
  "data": {
    "id": "booking-uuid",
    "bookingStatus": "CANCELLED",
    "paymentStatus": "REFUNDED",
    "cancelledAt": "2026-04-04T10:00:00.000Z",
    "cancelReason": "Change of plans"
  }
}
```

**Response (no refund — cancelled < 2hr before):**
```json
{
  "success": true,
  "message": "Booking cancelled. No refund (cancelled within 2 hours of slot).",
  "data": {
    "bookingStatus": "CANCELLED",
    "paymentStatus": "SUCCESS"
  }
}
```

---

---

### 8. Get Active Booking (Today)
```
GET /api/v3/booking/my-bookings/active
```

**Description:** Returns the user's bookings for the current day that are in `CONFIRMED` or `PENDING` status. Perfect for a "Quick Access" dashboard screen.

**Response:**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "id": "booking-uuid",
      "displayId": "TRF-A6C1EDC",
      "bookingDate": "2026-04-03T00:00:00.000Z",
      "startTime": "18:00",
      "endTime": "19:00",
      ...
    }
  ]
}
```

---

### 9. Rate Turf (only after COMPLETED)
```
POST /api/v3/booking/my-bookings/:bookingId/rateTurf
```

**Request Body:**
```json
{
  "rating": 5,
  "review": "Excellent turf! Great floodlights."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Thank you for your review!",
  "data": {
    "id": "rating-uuid",
    "userId": "auth-uuid",
    "turfId": "turf-uuid",
    "bookingId": "booking-uuid",
    "rating": 5,
    "review": "Excellent turf! Great floodlights.",
    "createdAt": "2026-04-05T16:00:00.000Z"
  }
}
```

---

### 10. Get All My Bookings
```
GET /api/v3/booking/my-bookings
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": "booking-uuid-1",
      "bookingDate": "2026-04-05T00:00:00.000Z",
      "startTime": "14:00",
      "endTime": "15:00",
      "bookingStatus": "CONFIRMED",
      "paymentStatus": "SUCCESS",
      "paymentType": "ONLINE",
      "amount": 1200,
      "turf": {
        "id": "turf-uuid",
        "name": "Champions Arena",
        "city": "Mumbai",
        "address": "123 Sports Complex",
        "sportsType": "FOOTBALL",
        "entranceUrl": "https://...",
        "groundDayUrl": "https://...",
        "owner": {
          "name": "Rahul Shah",
          "contactNumber": "9876543210"
        }
      },
      "rating": null
    }
  ]
}
```

---

### 11. Get Single Booking Details
```
GET /api/v3/booking/my-bookings/:bookingId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "booking-uuid",
    "bookingDate": "2026-04-05T00:00:00.000Z",
    "startTime": "14:00",
    "endTime": "15:00",
    "durationMins": 60,
    "bookingStatus": "CONFIRMED",
    "paymentStatus": "SUCCESS",
    "paymentType": "ONLINE",
    "amount": 1200,
    "checkInPin": null,
    "visitedAt": null,
    "notes": "Need extra footballs",
    "turf": {
      "id": "turf-uuid",
      "name": "Champions Arena",
      "city": "Mumbai",
      "address": "123 Sports Complex",
      "pincode": "400001",
      "sportsType": "FOOTBALL",
      "turfSize": "100x60 ft",
      "lat": 19.076,
      "lng": 72.8777,
      "entranceUrl": "https://...",
      "groundDayUrl": "https://...",
      "groundNightUrl": "https://...",
      "floodLights": true,
      "parking": true,
      "washroom": true,
      "weekdayDayPrice": 1200,
      "weekdayNightPrice": 1500,
      "weekendDayPrice": 1500,
      "weekendNightPrice": 1800,
      "owner": {
        "name": "Rahul Shah",
        "contactNumber": "9876543210"
      }
    },
    "rating": null
  }
}
```

---

### 12. Get Invoice (JSON)
```
GET /api/v3/booking/my-bookings/:bookingId/invoice
```
*Returns the invoice data in JSON format.*

---

### 12.5 Download Invoice (PDF)
```
GET /api/v3/booking/my-bookings/:bookingId/invoice/pdf
```

**Description:** Returns a professionally formatted PDF invoice for a specific booking.

**Action:** Directly downloads a `.pdf` file.

---

### 13. Filtered Bookings (Status / Filter / Date)
```
GET /api/v3/booking/my-bookings/bookings?status=upcoming
GET /api/v3/booking/my-bookings/bookings?status=past
GET /api/v3/booking/my-bookings/bookings?filter=today
GET /api/v3/booking/my-bookings/bookings?filter=tomorrow
GET /api/v3/booking/my-bookings/bookings?filter=week
GET /api/v3/booking/my-bookings/bookings?date=2026-04-05
```

| Query Param | Values | Description |
|------------|--------|-------------|
| `status` | `upcoming`, `past` | Upcoming = PENDING/CONFIRMED + future dates. Past = COMPLETED/CANCELLED + old dates. |
| `filter` | `today`, `tomorrow`, `week` | Filter by date range |
| `date` | `YYYY-MM-DD` | Filter by exact date |

**Response (same shape as "Get All My Bookings"):**
```json
{
  "success": true,
  "count": 1,
  "data": [ { "...same booking object with turf..." } ]
}
```

---

### 14. Transaction History
```
GET /api/v3/booking/transaction-history
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "id": "booking-uuid",
      "amount": 1200,
      "paymentType": "ONLINE",
      "paymentStatus": "SUCCESS",
      "bookingStatus": "COMPLETED",
      "razorpayOrderId": "order_PqR1234567890",
      "razorpayPaymentId": "pay_AbC9876543210",
      "bookingDate": "2026-04-05T00:00:00.000Z",
      "startTime": "14:00",
      "endTime": "15:00",
      "createdAt": "2026-04-02T10:30:00.000Z",
      "cancelledAt": null,
      "turf": {
        "id": "turf-uuid",
        "name": "Champions Arena",
        "city": "Mumbai",
        "entranceUrl": "https://..."
      }
    }
  ]
}
```

---

### 15. System Cron Triggers (External Triggers)
These endpoints are designed to be hit by a cron-scheduler (like cron-job.org or AWS EventBridge) to automate background tasks.

**Mark No-Shows (Call every ~5 mins):**
```
POST /api/v3/booking/cron/no-shows
```

**Auto-Complete Online Bookings (Call every ~10 mins):**
```
POST /api/v3/booking/cron/auto-complete
```

## 🧪 Quick Test Sequence (Postman)

1. **Check availability** → `GET /api/v3/booking/availability/:turfId?date=2026-04-05`
2. **Create booking** → `POST /api/v3/booking` (use CASH for easy test)
3. **Try booking overlapping time** → (Should fail with 400 Bad Request)
4. **Check it appears** → `GET /api/v3/booking/my-bookings`
5. **View details** → `GET /api/v3/booking/my-bookings/:bookingId`
6. **View upcoming** → `GET /api/v3/booking/my-bookings/bookings?status=upcoming`
5. **View today's** → `GET /api/v3/booking/my-bookings/bookings?filter=today`
6. **Cancel it** → `PATCH /api/v3/booking/:bookingId/cancel`
7. **Check transactions** → `GET /api/v3/booking/transaction-history`
8. **Create another (CASH)** → Complete via PIN verify → then rate it
