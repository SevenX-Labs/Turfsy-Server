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
Owner verifies PIN (POST :bookingId/verify-pin) -> Booking marked as COMPLETED
```

### 3. Payment Types & Deposit Rules

| paymentType | Online Deposit | At Turf Payment |
|-------------|----------------|-----------------|
| `FULL_ONLINE` | 100% | 0% |
| `HALF_ONLINE_HALF_CASH` | 50% | 50% |
| `FULL_CASH` | 0% | 100% |

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

### 7. Splitwise (Split Payment)

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

### 8. Cancel Booking
```
PATCH /api/v3/booking/:bookingId/cancel
```
**Request Body:** `{ "reason": "Weather issues" }`
**Refund Logic:** Automated partial refund (e.g., 75%) if payment was `SUCCESS`.

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

### 1. Verify Check-in PIN
```
POST /api/v3/booking/:bookingId/verify-pin
```
**Body:** `{ "pin": "1234" }`
**Result:** Marks booking as `COMPLETED`. Required for CASH and HALF_CASH.

---

### 2. Mark Completed (Online Only)
```
PATCH /api/v3/booking/:bookingId/complete
```
**Description:** For Fully Online bookings where owner confirms user arrived without PIN.

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

### 3. Auto-Complete Cron
`POST /api/v3/booking/cron/auto-complete`
Auto-marks `CONFIRMED` fully-online bookings as `COMPLETED` 2 hours after the slot ends.

### 4. Slot Lock
When a booking is created (PENDING), the slot is locked for **5 minutes**. If payment is not confirmed within this window, the lock expires and the slot becomes available again for others.
