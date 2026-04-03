# 🏟️ Turfsy Owner Dashboard API

This documentation details the business intelligence and dashboard endpoints designed specifically for Turf Owners to monitor and manage their business performance.

---

## 🔐 Configuration
- **Host**: `{{BASE_URL}}` (e.g., `https://api.turfsy.com`)
- **Common Prefix**: `/api/v3`
- **Authorization**: Required (`Bearer <JWT_TOKEN>` with `OWNER` role).

---

## 📈 1. Master Dashboard Statistics
Get the complete dashboard state in a single call. Useful for initial page load.

- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-home/dashboard`
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
Quick access to daily/monthly financial performance for small widgets.

- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-home/revenue-summary`
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
Aggregated counts of all booking statuses for the "Stats Grid" widget.

- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-home/booking-statistics`
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
Fetch the latest booking logs for the "Recent Activity" feed.

- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-home/recent-activity`
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
Historical data for 7-day charts.

- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-home/trends`
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
Online vs Cash split breakdown for pie charts.

- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-home/payment-distribution`
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
- **Full Endpoint**: `/api/v3/owner-home/turf-performance`
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

## 📉 Deep Analytics (New Module)
The new `OwnerAnalytics` module provides a technical deep-dive into your business performance.

### 🚀 Overall Analytics Deep-Dive
Use this for full-screen "Report" pages with many graphs.

- **Method**: `GET`
- **Full Endpoint**: `/api/v3/owner-analytics/overall`
- **Request Body**: `None`
- **Expected Response**: `200 OK`
```json
{
  "success": true,
  "data": {
    "totalRevenue": 250000,
    "totalBookings": 150,
    "completedBookings": 120,
    "cancelledBookings": 25,
    "noShowBookings": 5,
    "revenueByDate": [
      { "date": "2026-04-01", "revenue": 5000 },
      { "date": "2026-04-02", "revenue": 8000 }
    ],
    "bookingsByDate": [
      { "date": "2026-04-01", "count": 4 },
      { "date": "2026-04-02", "count": 7 }
    ],
    "cashVsOnline": {
      "cashAmount": 80000,
      "onlineAmount": 170000
    },
    "peakHours": [
      { "hour": "18:00", "count": 45 },
      { "hour": "19:00", "count": 42 }
    ],
    "cancellationRate": "16.7%",
    "noShowRate": "3.3%"
  }
}
```

---

## 🎯 Implementation Notes
1. **Context Isolation**: The frontend **does not** need to construct a payload or calculate rates (like Cancellation/No-show rates). All intelligence is calculated on the server and returned ready-to-display.
2. **REST Standards**: These are pure `GET` endpoints fetching read-only analytics data.
3. **Frontend Strategy**:
   - For high-performance mobile/web apps, fetch the individual widgets (Stats, Trends, Activity) separately using their respective endpoints.
   - For a quick "Home" screen load where all data is needed immediately, use the master `/dashboard` endpoint.
4. **Currencies**: All revenue figures are in **INR**.
