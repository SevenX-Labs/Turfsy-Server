# 🏟️ Turf Management Documentation

This document provides a comprehensive guide to the Turf creation, update, and retrieval endpoints.

## 📌 Architecture Overview

- **Storage Strategy**: Local disk storage organized by `turfId`.
- **Path**: `./uploads/turfs/{turfId}/{unique-filename}.ext`
- **Rate Limiting**: 10 requests per minute per IP.
- **Image Specs**: 
  - Max Size: 5MB per image.
  - Allowed Formats: `jpg, jpeg, png, gif, webp`.
  - Automatic cleanup of old images on update.

---

## 🚀 Endpoints

### 1. Create a Turf
Owners can create a turf profile. Initial images are not required at this step; they are uploaded separately.

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
Upload up to 4 specific images for a turf. This endpoint is idempotent and handles cleanup of old files.

- **URL**: `POST /api/v3/turfs/:turfId/images`
- **Auth**: Required
- **Body (`multipart/form-data`)**:
  - `entrance`: (File) Main entrance image
  - `dayTurf`: (File) Ground image during daylight
  - `nightTurf`: (File) Ground image under floodlights
  - `seatingArea`: (File) Seating/Wait area image

**Success Response (200 OK):**
```json
{
  "id": "turf-uuid-here",
  "entranceUrl": "http://localhost:3000/uploads/turfs/turf-uuid/1711465200-entrance.jpg",
  "groundDayUrl": "http://localhost:3000/uploads/turfs/turf-uuid/1711465200-day.jpg",
  "groundNightUrl": "http://localhost:3000/uploads/turfs/turf-uuid/1711465200-night.jpg",
  "seatingAreaUrl": "http://localhost:3000/uploads/turfs/turf-uuid/1711465200-seating.jpg",
  "...otherFields": "..."
}
```

---

### 3. Get Turf Details (Consumer View)
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

### 4. Update Turf Status
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

## 🛠️ Testing with Postman/cURL

### Uploading Images via cURL:
```bash
curl -X POST http://localhost:3000/api/v3/turfs/YOUR_TURF_ID/images \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "entrance=@/path/to/entrance.jpg" \
  -F "dayTurf=@/path/to/ground_day.jpg"
```

### Note on Static Assets:
Ensure the following line is in your `main.ts` to access images in the browser:
`app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads/' });`
