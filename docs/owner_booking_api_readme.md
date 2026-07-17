# Turfsy Owner Booking API (v3) 🏟️

This documentation covers the endpoints available to **Turf Owners** for managing bookings at their turfs.

## 🔐 Base URL
`{{api_url}}/api/v3/booking`

---

## 🧠 Brain Recall Line
> **“List → Filter → Active → Detail → Analytics → Verify QR → Manual Check-In”**

---

## Authentication
All endpoints require a **Bearer JWT Token** with the `OWNER` role.

---

## 📥 1. Get All Bookings
Get all bookings for all turfs owned by the current owner.

- **Endpoint**: `GET /owner/bookings`
- **Success Response**: `200 OK` (Array of bookings with customer details)

---

## 🔍 2. Get Filtered Bookings
Filter bookings by status, date, or relative timeframes.

- **Endpoint**: `GET /owner/bookings-filtered`
- **Query Parameters**:
  - `status`: `upcoming` (CONFIRMED/PENDING) or `past` (COMPLETED/CANCELLED/NO_SHOW)
  - `time`: `today`, `tomorrow`, `week`
  - `date`: Specific date in `YYYY-MM-DD`
- **Query Examples**:
  - `?status=upcoming`
  - `?status=past`
  - `?time=today`
  - `?time=tomorrow`
  - `?time=week`
  - `?date=2026-04-03`
- **Success Response**: `200 OK`

---

## 📄 3. Get Single Booking Details
Get full details of a specific booking including customer contact info.

- **Endpoint**: `GET /owner/bookings/:bookingId`
- **Success Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "displayId": "TRF-A1B2C3D",
    "userName": "John Doe",
    "userPhone": "9876543210",
    "userEmail": "john@example.com",
    "bookingStatus": "CONFIRMED",
    "paymentType": "CASH",
    "bookingDate": "2026-05-05",
    "startTime": "09:00",
    "endTime": "10:00",
    "totalAmount": 1000,
    "depositAmount": 500,
    "pendingAmount": 500,
    ...
  }
}
```

---

## 📈 4. Get Business Analytics
Get high-level business intelligence (Revenue, counts, trends) for all your turfs.

- **Endpoint**: `GET /owner/analytics`
- **Success Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "counts": { "total": 150, "completed": 120, "cancelled": 15, "noShow": 5, "activeToday": 12 },
    "revenue": { "total": 145000, "pending": 25000 }
  }
}
```

---

## 📥 5. Download Analytics (CSV/PDF)
Export your booking records for accounting or offline viewing.

**CSV Export:**
- **Endpoint**: `GET /owner/analytics/csv`
- **Action**: Downloads a `.csv` file with all columns.

**PDF Report:**
- **Endpoint**: `GET /owner/analytics/pdf`
- **Action**: Downloads a professional `.pdf` summary report.

---

## 📅 6. Get Active Bookings (Today)
Quickly see all bookings for today that are confirmed or pending.

- **Endpoint**: `GET /owner/bookings/active`
- **Success Response**: `200 OK` (Array of today's bookings)

---

## 🔢 7. Verify Check-In QR
Used to verify a customer's signed QR payload when they arrive at the turf.

- **Endpoint**: `POST /verify-qr`
- **Security**: OWNER role, rate-limiting, constant-time comparison.
- **Rules**:
  - Window: Slot start - 10 min to Slot end + 10 min.
  - QR expires after the check-in window.
- **Request Body**:
```json
{
  "qrData": "{...signed QR payload...}"
}
```
- **Success Response**: `200 OK`

---

## ✅ 8. Manual Check-In (Fallback)
Used to mark a booking as COMPLETED manually when QR scanning is not possible.

- **Endpoint**: `POST /:bookingId/manual-checkin`
- **Rules**:
  - Only available to the owning turf owner.
  - Uses the same check-in window as QR verification.
- **Success Response**: `200 OK`

---

## Error Codes
| Status | Meaning |
| :--- | :--- |
| `401` | Unauthorized (Invalid or expired JWT) |
| `403` | Forbidden (Not an OWNER or doesn't own this turf) |
| `404` | Booking not found |
| `423` | Resource Locked (5 failed PIN attempts) |
| `400` | Bad Request (Slot not started, or window expired) |
