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
API returns 'amountToPay' based on paymentType selection
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
CASH-inclusive Booking:
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
| `PENDING` | Created, waiting for online deposit/payment |
| `CONFIRMED` | Payment done (if online) OR auto-confirmed (if FULL_CASH) |
| `COMPLETED` | User visited the turf and PIN verified |
| `CANCELLED` | Cancelled by user or system |
| `NO_SHOW` | Time passed and user never checked in |

### Payment Status (`paymentStatus`)
| Status | Meaning |
|--------------|---------|
| `PENDING` | Awaiting payment |
| `SUCCESS` | Online payment received |
| `FAILED` | Online payment attempt failed |
| `REFUNDED` | Online payment refunded after cancellation |

---

## 📋 USER API ENDPOINTS

### 1. Get Turf Availability (Booked Slots)
```
GET /api/v3/booking/availability/:turfId?date=2026-04-05
```
**Description:** Show available/unavailable slots to the user.
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
**Options for `paymentType`:** `FULL_ONLINE`, `HALF_ONLINE_HALF_CASH`, `FULL_CASH`.

**Response (FULL_ONLINE Example):**
```json
{
  "success": true,
  "data": {
    "id": "booking-uuid",
    "displayId": "TRF-xxxx",
    "bookingStatus": "PENDING",
    "amount": 1200,
    "depositAmount": 1200,
    "amountToPay": 1200,
    "remainingAmount": 0
  }
}
```

---

### 3. Quick Pay-At-Turf Booking
```
POST /api/v3/booking/pay-at-turf
```
**Description:** Shortcut to create a booking with `paymentType` forced to `FULL_CASH`. Ideal for "Quick Book".

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
*Fields are optional; missing ones are cloned from the original booking.*

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
    "amount": 60000, 
    "currency": "INR",
    "keyId": "rzp_test_..."
  }
}
```
*(Note: `amount` is in Paise! 60000 = ₹600)*

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

### 7. Cancel Booking
```
PATCH /api/v3/booking/:bookingId/cancel
```
**Request Body:** `{ "reason": "Weather issues" }`

---

### 8. My Bookings (List & Filter)
```
GET /api/v3/booking/my-bookings
GET /api/v3/booking/my-bookings/active
GET /api/v3/booking/my-bookings/bookings?status=upcoming
GET /api/v3/booking/my-bookings/bookings?filter=week&date=2026-04-05
```

---

### 9. Single Booking Details
```
GET /api/v3/booking/my-bookings/:bookingId
```

---

### 10. Rate Completed Booking
```
POST /api/v3/booking/my-bookings/:bookingId/rateTurf
```
**RequestBody:** `{ "rating": 5, "review": "Great lighting!" }`

---

### 11. Transaction History
```
GET /api/v3/booking/transaction-history
```
**Description:** List of all payments and associated booking details.

---

## 🏢 OWNER API ENDPOINTS
**Base Path:** `/api/v3/booking` | **Role:** `OWNER`

### 1. Verify Check-in PIN
```
POST /api/v3/booking/:bookingId/verify-pin
```
**Description:** Mark a booking (CASH/HALF_CASH) as COMPLETED.
**RequestBody:** `{ "pin": "1234" }`

---

### 2. Manual Complete (Online only)
```
PATCH /api/v3/booking/:bookingId/complete
```
**Description:** Mark a fully online booking as COMPLETED without PIN.

---

### 3. Owner Booking Lists
```
GET /api/v3/booking/owner/bookings
GET /api/v3/booking/owner/bookings/active
GET /api/v3/booking/owner/bookings-filtered?time=today&status=upcoming
```

---

### 4. Single Booking Details (Owner)
```
GET /api/v3/booking/owner/bookings/:bookingId
```

---

### 5. Owner Analytics & Reports
```
GET /api/v3/booking/owner/analytics
GET /api/v3/booking/owner/analytics/csv
GET /api/v3/booking/owner/analytics/pdf
```

---

## ⚙️ SYSTEM & WEBHOOKS

### 1. Razorpay Webhook
```
POST /api/v3/booking/razorpay/webhook
```
**Headers:** `x-razorpay-signature` | Verifies and confirms booking.

### 2. No-Show Cron
```
POST /api/v3/booking/cron/no-shows
```
**Guard:** `X-Cron-Secret` | Mark CONFIRMED bookings as NO_SHOW if slot/buffer time passed.

### 3. Auto-Complete Cron
```
POST /api/v3/booking/cron/auto-complete
```
**Guard:** `X-Cron-Secret` | Auto-completes fully paid online bookings after slot end time.
