# Turfsy Booking API Documentation

Base URL: `/api/v3/booking`  
Health URL: `/sahil/hode/api/health`
**All endpoints require JWT** (except Webhook/Cron) → `Authorization: Bearer <token>`

---

## 📌 BOOKING Lifecycle & Flow

### 1. Unified Payment Flow
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
API returns 'amountToPay' AND acquires a 5-minute Slot Lock
   ↓
Create Order (POST :bookingId/create-order) -> Gets Razorpay order ID
   ↓
User pays via Razorpay Gateway (Web/App UI)
   ↓
Confirm Payment (POST :bookingId/confirm-payment with signature)
   ↓
   ├── Payment SUCCESS
   │    └── bookingStatus = CONFIRMED
   │    └── paymentStatus = SUCCESS
   │
   └── Payment FAILED
        └── bookingStatus = PENDING (allows retry)
        └── paymentStatus = FAILED
```

### 2. PIN Verification (For Visit)
```text
HALF_ONLINE or FULL_CASH Booking:
Booking Confirmed -> 4-digit checkInPin Generated (e.g. 4821)
User arrives at Turf -> Shows PIN -> Pays any remaining amount
Owner verifies QR (POST /api/v3/booking/verify-qr) -> Booking marked as COMPLETED
```

### 3. Payment Types & Deposit Rules

| paymentType | Online Deposit | At Turf Payment |
|-------------|----------------|-----------------|
| `FULL_ONLINE` | 100% | 0% |
| `HALF_ONLINE_HALF_CASH` | 50% | 50% |
| `FULL_CASH` | 0% | 100% |

### 4. Slot, Time, and Booking Window Rules

- Booking dates are accepted only in `YYYY-MM-DD`.
- Start and end times must be `HH:MM` in 24-hour format.
- The backend rejects bookings in the past.
- The booking window is limited to 90 days from today.
- Same-day bookings must be made at least 30 minutes before the slot start time.
- The slot must fall inside the turf operating window.
- Overnight turfs are supported, but the slot still must not cross a closed period.
- Duration must match `startTime` and `endTime`, and it must be between 60 and 360 minutes in 30-minute steps.

### 5. Slot Lock and Availability Logic

- When a booking is created, the slot is locked for 5 minutes.
- If online payment is not confirmed within that window, the expiry worker marks the booking expired and frees the slot.
- The availability endpoint shows already booked slots plus a synthetic blocked slot for the current same-day cutoff window.
- For same-day bookings, the API returns `minBookableTime` so the frontend can disable earlier slots.
- Slot conflict checks happen both through the temporary Redis lock and through the database transaction to avoid double booking.

### 6. Razorpay Payment Flow

- `POST /api/v3/booking/:bookingId/create-order` creates a Razorpay order using the booking deposit amount from the database.
- `POST /api/v3/booking/:bookingId/confirm-payment` verifies the Razorpay signature with HMAC before confirming the booking.
- The backend also checks that the Razorpay order amount matches the stored booking amount.
- `POST /api/v3/booking/razorpay/webhook` acts as the server-to-server fallback when client confirmation is skipped or fails.
- If payment succeeds, the booking becomes `CONFIRMED` and the slot lock is released.
- If payment fails, the booking remains retryable while still in `PENDING`.

---

## 📊 State Reference

### Booking Status (`bookingStatus`)
| Status | Meaning |
|--------------|---------|
| `PENDING` | Created, waiting for online deposit. Slot locked for 5 mins. |
| `CONFIRMED` | Payment done (if online) OR auto-confirmed (if FULL_CASH) |
| `COMPLETED` | User visited the turf and PIN verified |
| `CANCELLED` | Cancelled by user or system |
| `NO_SHOW` | Time passed (15 mins past start) and user never checked in |

### Payment Status (`paymentStatus`)
| Status | Meaning |
|--------------|---------|
| `PENDING` | Awaiting payment (or cash payment at turf) |
| `SUCCESS` | Online payment received |
| `FAILED` | Online payment attempt failed |
| `REFUNDED` | Online payment refunded after cancellation |

### Refund and Cancellation Matrix

The cancellation flow calculates the refund from the paid online amount, not from the raw booking total.

| Scenario | Refund Result |
|---------|---------------|
| `PENDING_APPROVAL` booking cancelled before owner approval | Refund the turf/advance portion if the booking was paid online. |
| `CONFIRMED` booking cancelled more than 72 hours before slot | 100% of the turf/advance portion is refundable. |
| `CONFIRMED` booking cancelled between 24 and 72 hours before slot | 50% of the turf/advance portion is refundable. |
| `CONFIRMED` booking cancelled less than 24 hours before slot | No refund. |
| `FULL_CASH` late cancellation within 24 hours | No online refund applies, but the user is tracked for late-cancellation limits. |

Important details:
- Refunds only apply when a Razorpay payment exists.
- The platform fee is excluded from the refunded turf portion.
- `refundStatus` flows through `NONE -> INITIATED -> PROCESSED` or `FAILED`.
- `paymentStatus` becomes `REFUNDED` only when Razorpay processes the refund successfully.

---

## 📋 USER API ENDPOINTS

### 1. Get Turf Availability (Booked Slots)
```
GET /api/v3/booking/availability/:turfId?date=2026-04-05
```
**Description:** Show available/unavailable slots. Returns pricing rules for that specific date.
**Response:**
```json
{
  "success": true,
  "data": {
    "openTime": "06:00",
    "closeTime": "23:00",
    "bookedSlots": [{ "startTime": "14:00", "endTime": "15:00" }],
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
  "turfId": "uuid",
  "bookingDate": "2026-04-05",
  "startTime": "14:00",
  "endTime": "15:00",
  "durationMins": 60,
  "paymentType": "FULL_ONLINE",
  "notes": "Need extra footballs",
  "playersCount": 12
}
```
**Validation:** 
- `paymentType` must be `FULL_ONLINE`, `HALF_ONLINE_HALF_CASH`, or `FULL_CASH`.
- `bookingDate` must be YYYY-MM-DD.
- Time must be HH:MM (24hr).
- **Strict Mode**: Extra fields (like `sportsType`) will cause 400 Bad Request.

**Response:**
```json
{
  "success": true,
  "message": "Booking created. Pay full amount...",
  "data": {
    "id": "booking-uuid",
    "displayId": "TRF-xxxx",
    "bookingStatus": "PENDING",
    "amount": 1200,
    "depositAmount": 1200,
    "amountToPay": 1200,
    "remainingAmount": 0,
    "checkInPin": "4821",
    "pinExpiresAt": "2026-04-05T15:00:00Z"
  }
}
```

---

### 3. Quick Pay-At-Turf Booking
```
POST /api/v3/booking/pay-at-turf
```
**Description:** Convenience endpoint. Same body as Create Booking, but `paymentType` is forced to `FULL_CASH`.

---

### 4. Rebook Past Booking
```
POST /api/v3/booking/:bookingId/rebook
```
**Request Body:**
```json
{
  "bookingDate": "2026-05-10",
  "startTime": "18:00", 
  "paymentType": "HALF_ONLINE_HALF_CASH"
}
```
*Missing fields are cloned from the original booking. Returns the same response as Create Booking.*

---

### 5. Create Razorpay Order
```
POST /api/v3/booking/:bookingId/create-order
```
**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "order_PqR...",
    "amount": 120000, 
    "currency": "INR",
    "keyId": "rzp_test_..."
  }
}
```
*(Note: `amount` is in Paise for Razorpay!)*

---

### 6. Confirm Online Payment
```
POST /api/v3/booking/:bookingId/confirm-payment
```
**Request Body:**
```json
{
  "razorpayOrderId": "order_xxx",
  "razorpayPaymentId": "pay_xxx",
  "razorpaySignature": "sig_xxx"
}
```

---

### 7. Refunds and Cancellation

There is no separate manual refund endpoint in the booking controller. Refunds are handled through cancellation and the Razorpay webhook flow.

#### Cancel Booking
```
PATCH /api/v3/booking/:bookingId/cancel
```
**Request Body:** `{ "reason": "Weather issues" }`
**Behavior:**
- If an online payment was captured, the service calculates the refundable turf portion and calls Razorpay.
- `refundStatus` is updated to `INITIATED`, `PROCESSED`, or `FAILED`.
- `paymentStatus` becomes `REFUNDED` when Razorpay confirms the refund.
- Webhook events `refund.created`, `refund.processed`, and `refund.failed` keep the booking record in sync.
- If the refund API fails, the booking remains cancelled but `refundStatus` becomes `FAILED` so support can reconcile it.

#### Payment Failed
```
POST /api/v3/booking/:bookingId/payment-failed
```
Marks the payment attempt as failed while keeping the booking available for retry.

---

### 8. Splitwise (Split Payment)

Split the booking `amount` across multiple players (like Splitwise). Only the **booking creator** (lead user) can manage the split.

**Important:** The lead user (you) is auto-added as the **first player** in the split. This requires you to have a `username` set in your user profile.

**Typical flow:**
1) `GET /api/v3/booking/:bookingId/split` (creates split if missing + returns players)
2) `POST /api/v3/booking/:bookingId/split/players` (add more players by username)
3) *(optional)* `PATCH /api/v3/booking/:bookingId/split/custom-amounts` (set custom amounts)
4) `POST /api/v3/booking/:bookingId/split/trigger` (finalize split)
5) `PATCH /api/v3/booking/split/players/:playerId/status` (mark a player as `PAID` / `PENDING`)

**Endpoints**
```text
GET    /api/v3/booking/:bookingId/split
POST   /api/v3/booking/:bookingId/split/players
DELETE /api/v3/booking/split/players/:playerId
PATCH  /api/v3/booking/:bookingId/split/custom-amounts
POST   /api/v3/booking/:bookingId/split/trigger
PATCH  /api/v3/booking/split/players/:playerId/status
```

**Add players request:**
```json
{
  "usernames": ["Rahul_07", "Neha-10"]
}
```

---

### 9. My Bookings
```
GET /api/v3/booking/my-bookings
GET /api/v3/booking/my-bookings/active
GET /api/v3/booking/my-bookings/bookings?status=upcoming
GET /api/v3/booking/my-bookings/bookings?filter=week
```

---

### 10. Transaction History
```
GET /api/v3/booking/transaction-history
```

---

### 11. Invoice & Receipt
```
GET /api/v3/booking/my-bookings/:bookingId/invoice
GET /api/v3/booking/my-bookings/:bookingId/invoice/pdf
```

---

## 🏢 OWNER API ENDPOINTS

### 1. Verify Check-in QR
```
POST /api/v3/booking/verify-qr
```
**Body:** `{ "qrData": "{...signed payload...}" }`
**Result:** Marks booking as `COMPLETED` when the QR is valid and within the check-in window.

---

### 2. Manual Check-In
```
POST /api/v3/booking/:bookingId/manual-checkin
```
**Description:** Owner override for cases where QR scanning is not possible.

---

### 3. Owner Dashboard & Analytics
```
GET /api/v3/booking/owner/bookings-filtered?time=today&status=upcoming
GET /api/v3/booking/owner/analytics
GET /api/v3/booking/owner/analytics/csv
GET /api/v3/booking/owner/analytics/pdf
```

---

## ⚙️ BACKGROUND LOGIC

### 1. Razorpay Webhook
`POST /api/v3/booking/razorpay/webhook`
Validates signature and confirms booking if the client-side confirmation fails or is skipped.

### 2. No-Show Cron
`POST /api/v3/booking/cron/no-shows`
Auto-marks `CONFIRMED` bookings as `NO_SHOW` if 15 minutes have passed since the slot started without a PIN verification.

### 3. Upcoming Check-In Cron
`POST /api/v3/booking/cron/upcoming-checkins`
Sends a notification to owners when the check-in window is about to open.

### 4. Slot Lock
When a booking is created (PENDING), the slot is locked for **5 minutes**. If payment is not confirmed within this window, the lock expires and the slot becomes available again for others.

### 5. Utility Endpoints
`GET /api/v3/booking/email-test` sends a test booking email.
`GET /api/v3/booking/customer/full-cash-status` returns whether the user can still use the Full Cash option.
