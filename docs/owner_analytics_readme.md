# 📊 Turfsy Owner Analytics API

This documentation details the business intelligence endpoints for Turf Owners to monitor performance metrics.

---

## 🔐 Configuration
- **Host**: `{{BASE_URL}}`
- **Common Prefix**: `/api/v3/owner-analytics`
- **Authorization**: Required (`Bearer <JWT_TOKEN>` with `OWNER` role).

---

## 🚀 1. Overall Summary
Quick overview of all core metrics.
- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-analytics/overall`
- **Response**:
```json
{
  "success": true,
  "data": {
    "totalRevenue": 250000,
    "totalBookings": 150,
    "completedBookings": 120,
    "cancelledBookings": 25,
    "noShowBookings": 5,
    "cancellationRate": "16.7%",
    "noShowRate": "3.3%"
  }
}
```

---

## 💰 2. Total Revenue
- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-analytics/total-revenue`
- **Response**: `{ "success": true, "data": { "totalRevenue": 250000 } }`

---

## 🎟️ 3. Total Bookings
- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-analytics/total-bookings`
- **Response**: `{ "success": true, "data": { "totalBookings": 150 } }`

---

## ✅ 4. Completed Bookings
- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-analytics/completed-bookings`
- **Response**: `{ "success": true, "data": { "completedBookings": 120 } }`

---

## ❌ 5. Cancelled Bookings
- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-analytics/cancelled-bookings`
- **Response**: `{ "success": true, "data": { "cancelledBookings": 25 } }`

---

## 🗓️ 6. Revenue By Date
- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-analytics/revenue-by-date`
- **Response**: `{ "success": true, "data": [ { "date": "2026-04-01", "revenue": 5000 }, { "date": "2026-04-02", "revenue": 8000 } ] }`

---

## 📉 7. Bookings By Date
- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-analytics/bookings-by-date`
- **Response**: `{ "success": true, "data": [ { "date": "2026-04-01", "count": 4 }, { "date": "2026-04-02", "count": 7 } ] }`

---

## 💳 8. Cash vs Online Distribution
- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-analytics/cash-vs-online`
- **Response**: `{ "success": true, "data": { "cashAmount": 80000, "onlineAmount": 170000 } }`

---

## ⏳ 9. Peak Booking Hours
- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-analytics/peak-hours`
- **Response**: `{ "success": true, "data": [ { "hour": "18:00", "count": 45 }, { "hour": "19:00", "count": 42 } ] }`

---

## ⚠️ 10. Cancellation Rate
- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-analytics/cancellation-rate`
- **Response**: `{ "success": true, "data": { "cancellationRate": "16.7%" } }`

---

## 🚫 11. No-Show Rate
- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-analytics/no-show-rate`
- **Response**: `{ "success": true, "data": { "noShowRate": "3.3%" } }`

---

## 🎯 Implementation Notes
1. **Context Isolation**: No frontend calculation or payload construction is needed. The server identifies your identity from the JWT.
2. **Currencies**: All revenue figures are in **INR**.
3. **Frontend Strategy**: Use these granular endpoints to build a dashboard where widgets load independently.
