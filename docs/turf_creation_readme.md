# 🏟️ Turf Management Documentation

This document provides a comprehensive guide to the Turf creation, update, and retrieval endpoints.

## 📌 Architecture & Security Overview

This module has been hardened for **production-grade security and scalability**.

- **🔒 Path Traversal Protection**: Turf IDs are stripped of all non-alphanumeric characters. When replacing images, `path.basename()` strictly locks file unlinking to the designated `/uploads/turfs/[id]/` directory, making arbitrary file deletion impossible.
- **⚡ Payload & DoS Protection**: The `nearby` search strictly limits queries to a `max 100km radius` and truncates responses to the top **50 closest turfs** to ensure fast latency and prevent out-of-memory crashes under heavy load.
- **📍 GPS Spoofing Prevention**: Coordinates (`lat`, `lng`) are mathematically validated between `[-90, 90]` and `[-180, 180]`. Additionally, coordinates are **immutable** via the update endpoint once created, guaranteeing physical location accuracy.
- **🛡️ Rate Limiting**: Global `@nestjs/throttler` guards allow a maximum of 10 requests per minute per IP to mitigate brute force and scraping.
- **🧹 Idempotent Garbage Collection**: Upload endpoints automatically unlink out-of-date image files from the disk, ensuring zero storage bloat over time.
- **📸 Strict Image Specs**: 
  - Max Size: 5MB per image to prevent storage exhaustion.
  - Count: **3 Explicit Images** (entrance, dayTurf, nightTurf).
  - Validation: Deep MIME-type checking ensures only real images (`jpg, jpeg, png, gif, webp`) are accepted, blocking disguised executable scripts.

---

## 🚀 Endpoints

### 1. Create a Turf
Owners can create a turf profile. Initial images are not required at this step; they are uploaded separately. 
**Note**: This is the only time `lat` and `lng` are accepted.

- **URL**: `POST /api/v3/turfs`
- **Auth**: Required (JWT - Owner Role)
- **Body (`application/json`)**:
```json
{
  "name": "Champions Arena",
  "description": "Premium 5-a-side football turf with high-quality grass.",
  "sportsType": "FOOTBALL",
  "turfSize": "100x60 ft",
  "address": "123 Sports Complex, MG Road",
  "city": "Mumbai",
  "pincode": "400001",
  "lat": 19.0760,
  "lng": 72.8777,
  "openTime": "06:00",
  "closeTime": "23:00",
  "minSlotDurationMins": 60,
  "floodLights": true,
  "parking": true,
  "washroom": true,
  "changingRoom": false,
  "drinkingWater": true,
  "seatingArea": true,
  "cafeteria": true,
  "weekdayDayPrice": 1200,
  "weekdayNightPrice": 1500,
  "weekendDayPrice": 1500,
  "weekendNightPrice": 1800
}
```

---

### 2. Upload/Update Turf Images
Upload the 3 specific images for a turf. This endpoint is idempotent and handles cleanup of old files.

- **URL**: `POST /api/v3/turfs/:turfId/images`
- **Auth**: Required
- **Body (`multipart/form-data`)**:
  - `entrance`: (File) Main entrance image
  - `dayTurf`: (File) Ground image during daylight
  - `nightTurf`: (File) Ground image under floodlights

**Success Response (200 OK):**
```json
{
  "id": "turf-uuid-here",
  "entranceUrl": "http://localhost:3000/uploads/turfs/turf-uuid/1711465200-entrance.jpg",
  "groundDayUrl": "http://localhost:3000/uploads/turfs/turf-uuid/1711465200-day.jpg",
  "groundNightUrl": "http://localhost:3000/uploads/turfs/turf-uuid/1711465200-night.jpg",
  "...otherFields": "..."
}
```

---

### 3. Update Turf
Update turf details. Fields like `lat` and `lng` are ignored if sent in the body.

- **URL**: `PATCH /api/v3/turfs/:turfId`
- **Auth**: Required (Owner)
- **Body (`application/json`)**:
```json
{
  "name": "Champions Arena (Updated)",
  "description": "Updated description for the turf.",
  "openTime": "07:00",
  "closeTime": "22:00",
  "weekdayDayPrice": 1300
  // lat and lng will be ignored if sent
}
```

---

### 4. Get Turf Details (Consumer View)
Retrieve full turf data formatted for the UI (Autoswipe, Reviews, Owner Contact).

- **URL**: `GET /api/v3/turfs/:turfId`
- **Auth**: Optional
- **Success Response (200 OK):**
```json
{
  "id": "turf-uuid",
  "name": "Champions Arena",
  "description": "Premium 5-a-side football turf...",
  "images": [
    "http://localhost:3000/uploads/turfs/.../123-entrance.jpg",
    "http://localhost:3000/uploads/turfs/.../123-day.jpg"
  ],
  "rating": 4.5,
  "reviewCount": 2,
  "openTime": "06:00",
  "closeTime": "23:00",
  "status": "ACTIVE",
  "address": "123 Sports Complex, MG Road",
  "city": "Mumbai",
  "weekdayDayPrice": 1200,
  "weekdayNightPrice": 1500,
  "weekendDayPrice": 1500,
  "weekendNightPrice": 1800,
  "owner": {
    "name": "Sahil",
    "contactNumber": "+91 9876543210"
  },
  "rules": [
    "No smoking inside the turf",
    "Wear proper non-marking sports shoes",
    "Please arrive 10 minutes before your slot"
  ],
  "customerReviews": [
    {
      "reviewerName": "Rohit Sharma",
      "rating": 5,
      "comment": "Excellent quality ground!"
    }
  ]
}
```

---

### 5. Update Turf Status
For admin/owner to toggle visibility.

- **URL**: `PATCH /api/v3/turfs/:turfId/status`
- **Auth**: Required (Owner)
- **Body**:
```json
{
  "status": "ACTIVE" // Options: ACTIVE, INACTIVE, UNDER_REVIEW
}
```

---

### 6. Search Nearby Turfs
Fetch turfs near a given location. The frontend can send coordinates from:
- **Option A**: User's current GPS location (auto-detect)
- **Option B**: Manually selected location from a map pin

- **URL**: `GET /api/v3/turfs/nearby?lat=19.0760&lng=72.8777&radiusKm=10`
- **Auth**: Not Required
- **Query Params**:
  - `lat` (required): Latitude of the search point
  - `lng` (required): Longitude of the search point
  - `radiusKm` (optional, default: 10): Search radius in kilometers

**Success Response (200 OK):**
```json
{
  "success": true,
  "count": 3,
  "radiusKm": 10,
  "data": [
    {
      "id": "turf-uuid-1",
      "name": "Champions Arena",
      "distanceKm": 1.23,
      "images": [
        "http://localhost:3000/uploads/turfs/.../entrance.jpg",
        "http://localhost:3000/uploads/turfs/.../day.jpg",
        "http://localhost:3000/uploads/turfs/.../night.jpg"
      ],
      "weekdayDayPrice": 1200,
      "weekdayNightPrice": 1500,
      "weekendDayPrice": 1500,
      "weekendNightPrice": 1800,
      "openTime": "06:00",
      "closeTime": "23:00",
      "owner": {
        "name": "Sahil",
        "contactNumber": "+91 9876543210"
      }
    }
  ]
}
```

---

## 🛠️ Testing with Postman/cURL

### Uploading Images via cURL:
```bash
curl -X POST http://localhost:3000/api/v3/turfs/YOUR_TURF_ID/images \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "entrance=@/path/to/entrance.jpg" \
  -F "dayTurf=@/path/to/ground_day.jpg"
```

### Fetching Nearby Turfs via cURL:
```bash
curl "http://localhost:3000/api/v3/turfs/nearby?lat=19.0760&lng=72.8777&radiusKm=15"
```

### Note on Static Assets:
Ensure the following line is in your `main.ts` to access images in the browser:
`app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads/' });`
