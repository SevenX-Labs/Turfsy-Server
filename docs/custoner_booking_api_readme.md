# Turfsy Booking API Documentation

Base URL: `/api/v3/booking`  
**All endpoints require JWT** → `Authorization: Bearer <token>`

---

## 📌 BOOKING FLOW (Read this first)

### 1. ONLINE Payment Flow
```text
Book Now
   ↓
Select Slots & See Live Availability (GET /availability/:turfId)
   ↓
Check Availability -> Proceed
   ↓
Create Booking (POST /api/v3/booking) -> Status is PENDING
   ↓
Pay Now (Razorpay Screen opens)
   ↓
    ┌─── Payment SUCCESS ───┐        ┌─── Payment FAILED ───┐
    ↓                        ↓        ↓                      ↓
 Confirm Payment API        Payment Failed API
 bookingStatus = CONFIRMED  bookingStatus = CANCELLED
 paymentStatus = SUCCESS    paymentStatus = FAILED
    ↓
 Visit Complete
 (Owner calls PATCH .../complete)
    ↓
 bookingStatus = COMPLETED
```

### 2. CASH Payment Flow
```text
Book Now
   ↓
Select Slots & See Live Availability
   ↓
Create Booking (POST /api/v3/booking with paymentType="CASH")
   ↓
Booking Confirmed -> checkInPin Generated
   ↓
User arrives at Turf -> Shows PIN
   ↓
Visit Complete
(Owner verifies PIN via POST .../verify-pin)
   ↓
bookingStatus = COMPLETED
paymentStatus = SUCCESS
```

### 3. Cancellation & Refund Rules
```text
User cancels booking → PATCH .../cancel

Cancellation Policies:
1. Online Paid Booking (Cancelled ≥ 2 HOURS before slot time):
   - User gets full refund. 
   - paymentStatus = REFUNDED
   
2. Online Paid Booking (Cancelled < 2 HOURS before slot time):
   - No refund provided.
   - paymentStatus = SUCCESS (payment retained by owner)

3. Cash / Unpaid Bookings:
   - Simply cancels the slot for others to book.
```

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
      },
      {
        "startTime": "16:00",
        "endTime": "17:30"
      }
    ]
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
  "amount": 1200,
  "notes": "Need extra footballs"
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
    "checkInPin": null,
    "createdAt": "2026-04-02T10:30:00.000Z"
  }
}
```

**Response (CASH) — same body but `paymentType: "CASH"`:**
```json
{
  "success": true,
  "message": "Booking confirmed. Show PIN to owner at check-in.",
  "data": {
    "id": "booking-uuid",
    "bookingStatus": "CONFIRMED",
    "paymentStatus": "PENDING",
    "paymentType": "CASH",
    "checkInPin": "4821",
    "pinExpiresAt": "2026-04-05T15:00:00.000Z",
    "amount": 1200
  }
}
```

---

### 3. Confirm Online Payment
```
POST /api/v3/booking/:bookingId/confirm-payment
```

**Request Body:**
```json
{
  "razorpayOrderId": "order_PqR1234567890",
  "razorpayPaymentId": "pay_AbC9876543210"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment successful. Booking confirmed!",
  "data": {
    "id": "booking-uuid",
    "bookingStatus": "CONFIRMED",
    "paymentStatus": "SUCCESS",
    "razorpayOrderId": "order_PqR1234567890",
    "razorpayPaymentId": "pay_AbC9876543210"
  }
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

### 5. Verify Cash PIN (Owner calls this)
```
POST /api/v3/booking/:bookingId/verify-pin
```

**Request Body:**
```json
{
  "pin": "4821"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Check-in verified. Booking completed!",
  "data": {
    "id": "booking-uuid",
    "bookingStatus": "COMPLETED",
    "paymentStatus": "SUCCESS",
    "visitedAt": "2026-04-05T14:05:00.000Z"
  }
}
```

---

### 6. Mark Booking Completed (Owner calls this for ONLINE bookings)
```
PATCH /api/v3/booking/:bookingId/complete
```

**Request Body:** None

**Response:**
```json
{
  "success": true,
  "message": "Booking marked as completed.",
  "data": {
    "id": "booking-uuid",
    "bookingStatus": "COMPLETED",
    "visitedAt": "2026-04-05T15:10:00.000Z"
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

### 8. Rate Turf (only after COMPLETED)
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

### 9. Get All My Bookings
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

### 10. Get Single Booking Details
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

### 11. Get Invoice
```
GET /api/v3/booking/my-bookings/:bookingId/invoice
```

**Response:**
```json
{
  "success": true,
  "data": {
    "invoiceId": "INV-A6C1EDC8",
    "bookingId": "booking-uuid",
    "bookingDate": "2026-04-05T00:00:00.000Z",
    "slot": "14:00 - 15:00",
    "duration": "60 mins",
    "amount": 1200,
    "paymentType": "ONLINE",
    "paymentStatus": "SUCCESS",
    "bookingStatus": "COMPLETED",
    "turf": {
      "name": "Champions Arena",
      "city": "Mumbai",
      "address": "123 Sports Complex",
      "pincode": "400001",
      "sportsType": "FOOTBALL",
      "owner": {
        "name": "Rahul Shah",
        "contactNumber": "9876543210",
        "email": "rahul@example.com"
      }
    },
    "customer": {
      "name": "Sahil Hode",
      "email": "sahil@example.com",
      "phone": "9999999999"
    },
    "createdAt": "2026-04-02T10:30:00.000Z"
  }
}
```

---

### 12. Filtered Bookings (Status / Filter / Date)
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

### 13. Transaction History
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
    },
    {
      "id": "booking-uuid-2",
      "amount": 900,
      "paymentType": "ONLINE",
      "paymentStatus": "REFUNDED",
      "bookingStatus": "CANCELLED",
      "bookingDate": "2026-04-03T00:00:00.000Z",
      "cancelledAt": "2026-04-02T08:00:00.000Z",
      "turf": {
        "id": "turf-uuid-2",
        "name": "Mumbai Premier Turf",
        "city": "Mumbai",
        "entranceUrl": null
      }
    }
  ]
}
```

---

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
