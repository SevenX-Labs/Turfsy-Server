# 🏟️ Turfsy Owner Dashboard API

This documentation details the business intelligence and dashboard endpoints designed specifically for Turf Owners to monitor and manage their business performance.

---

## 🔐 Base URL
`/api/v3/owner-home`

**Authorization:** Required (`Bearer <JWT_TOKEN>` with `OWNER` role).

---

## 📈 1. Master Dashboard Statistics
Get the complete dashboard state in a single call.

- **Method**: `GET`
- **Endpoint**: `/dashboard`
- **Request Body**: `None`
- **Expected Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "summary": {
      "revenue": { "today": 5000, "month": 150000, "overall": 1000000 },
      "counts": { "total": 150, "today": 12, "upcoming": 5, "completed": 120, "cancelled": 15, "noShow": 5 },
      "quickStats": { "avgBookingValue": 1200, "cancellationRate": "10.0%" }
    },
    "trends": {
      "revenueDaily": [ { "date": "2026-04-01", "revenue": 5000 }, { "date": "2026-04-02", "revenue": 7500 } ],
      "peakHour": "19:00",
      "paymentSplit": { "online": 100, "cash": 50 },
      "mostBookedTurf": "Champions Arena"
    },
    "recentBookings": [
      { "id": "uuid", "displayId": "TRF-A6C1EDC", "turfName": "Champions Arena", "amount": 1200, "status": "CONFIRMED", "createdAt": "2026-04-03T10:30:00Z" }
    ],
    "alerts": [ { "type": "INFO", "msg": "Busy day! You have 12 upcoming check-ins." } ]
  }
}
```

---

## 💰 2. Get Revenue Summary
Quick access to daily/monthly financial performance.

- **Method**: `GET`
- **Endpoint**: `/revenue-summary`
- **Request Body**: `None`
- **Expected Response**: `200 OK`
```json
{
  "success": true,
  "data": { "today": 5000, "month": 150000, "currency": "INR" }
}
```

---

## 📊 3. Get Booking Statistics
Aggregated counts of all booking statuses.

- **Method**: `GET`
- **Endpoint**: `/booking-statistics`
- **Request Body**: `None`
- **Expected Response**: `200 OK`
```json
{
  "success": true,
  "data": { "total": 150, "today": 12, "upcoming": 5, "completed": 120, "cancelled": 15, "noShow": 5 }
}
```

---

## 🕒 4. Get Recent Activity
Fetch the latest booking logs for the dashboard's activity list.

- **Method**: `GET`
- **Endpoint**: `/recent-activity`
- **Request Body**: `None`
- **Expected Response**: `200 OK`
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "displayId": "TRF-A6C1EDC", "turfName": "Champions Arena", "amount": 1200, "status": "CONFIRMED", "createdAt": "2026-04-03T10:30:00Z" }
  ]
}
```

---

## 📉 5. Get Revenue & Volume Trends
Data for the 7-day revenue/booking charts (typically used for Bar or Line charts).

- **Method**: `GET`
- **Endpoint**: `/trends`
- **Request Body**: `None`
- **Expected Response**: `200 OK`
```json
{
  "success": true,
  "data": [ { "date": "2026-04-01", "revenue": 5000, "count": 4 }, { "date": "2026-04-02", "revenue": 7000, "count": 6 } ]
}
```

---

## 💳 6. Get Payment Distribution
Online vs Cash breakdown for processing preferences.

- **Method**: `GET`
- **Endpoint**: `/payment-distribution`
- **Request Body**: `None`
- **Expected Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "online": { "count": 100, "percentage": "66.7" },
    "cash": { "count": 50, "percentage": "33.3" }
  }
}
```

---

## 🏆 7. Get Turf Performance Rankings
Ranking of your turfs by their revenue contribution.

- **Method**: `GET`
- **Endpoint**: `/turf-performance`
- **Request Body**: `None`
- **Expected Response**: `200 OK`
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "Champions Arena", "totalBookings": 95, "revenue": 114000 },
    { "id": "uuid", "name": "Elite Grounds", "totalBookings": 55, "revenue": 66000 }
  ]
}
```

---

## 🎯 Important Implementation Notes
1. **Context Isolation**: You don't need to pass a `turfId` or `ownerId` in the body. The system identifies your turfs automatically from your logged-in JWT token.
2. **REST Standards**: These are pure `GET` endpoints fetching read-only analytics data.
3. **Frontend Strategy**:
   - For high-performance mobile/web apps, fetch the individual widgets (Stats, Trends, Activity) separately using their respective endpoints.
   - For a quick "Home" screen load where all data is needed immediately, use the master `/dashboard` endpoint.
4. **Currencies**: All revenue figures are in **INR**.
