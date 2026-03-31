## 🚀 Endpoints

### 1. Create a Turf
Owners can create a turf profile. You can either supply the details as JSON, or as `multipart/form-data` to optionally upload the images simultaneously.
**Note**: This is the only time `lat` and `lng` are accepted.

- **URL**: `POST /api/v3/turfs`
- **Auth**: Required (JWT - Owner Role)
- **Body (`multipart/form-data` or `application/json`)**:
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
*(If using `multipart/form-data`, you may also include files for the `entrance`, `dayTurf`, and `nightTurf` fields.)*

---

### 2. Update Turf
Update turf details. Fields like `lat` and `lng` are ignored if sent in the body. You can also upload/replace images at the same time.

- **URL**: `PATCH /api/v3/turfs/:turfId`
- **Auth**: Required (Owner)
- **Body (`multipart/form-data` or `application/json`)**:
```json
{
  "name": "Champions Arena (Updated)",
  "openTime": "07:00",
  "closeTime": "22:00",
  "weekdayDayPrice": 1300
}
```

---

### 3. Upload/Update Turf Images (Bulk)
Upload the 3 specific images for a turf in a single request. This endpoint is idempotent—subsequent uploads automatically overwrite the old images in the Supabase S3 bucket.

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
  "entranceUrl": "https://zgryqgoajdousrqdofcs.supabase.co/storage/v1/object/public/uploads/turfs/{turfId}/entrance.jpg",
  "groundDayUrl": "https://zgryqgoajdousrqdofcs.supabase.co/storage/v1/object/public/uploads/turfs/{turfId}/dayTurf.jpg",
  "groundNightUrl": "https://zgryqgoajdousrqdofcs.supabase.co/storage/v1/object/public/uploads/turfs/{turfId}/nightTurf.jpg",
  "...otherFields": "..."
}
```

---

### 4. Upload Single Turf Image (One-by-One)
Upload or replace a single specific image for a turf.

- **URL**: `PATCH /api/v3/turfs/:turfId/upload-image/:type`
  *(Where `:type` must be exactly `entrance`, `dayTurf`, or `nightTurf`)*
- **Auth**: Required
- **Body (`multipart/form-data`)**:
  - `file`: (File) The image file to upload

---

### 5. Get Turf Details (Consumer View)
Retrieve full turf data formatted for the UI (Autoswipe, Reviews, Owner Contact). Images are served directly via public Supabase URLs.

- **URL**: `GET /api/v3/turfs/:turfId`
- **Auth**: Optional
- **Success Response (200 OK):**
```json
{
  "id": "turf-uuid",
  "name": "Champions Arena",
  "description": "Premium 5-a-side football turf...",
  "images": [
    "https://zgryqgoajdousrqdofcs.supabase.co/storage/v1/object/public/uploads/turfs/{turfId}/entrance.jpg",
    "https://zgryqgoajdousrqdofcs.supabase.co/storage/v1/object/public/uploads/turfs/{turfId}/dayTurf.jpg"
  ],
  "rating": 4.5,
  "openTime": "06:00",
  "closeTime": "23:00",
  "status": "ACTIVE",
  "weekdayDayPrice": 1200,
  "weekendDayPrice": 1500,
  "owner": {
    "name": "Sahil",
    "contactNumber": "+91 9876543210"
  }
}
```

---

### 6. Update Turf Status
For admin/owner to toggle visibility.

- **URL**: `PATCH /api/v3/turfs/:turfId/status`
- **Auth**: Required (Owner)
- **Body**:
```json
{
  "status": "ACTIVE" // Options: ACTIVE, INACTIVE
}
```

---

### 7. Search Nearby Turfs
Fetch turfs near a given location.

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
        "https://zgryqgoajdousrqdofcs.supabase.co/storage/v1/object/public/uploads/turfs/{turfId}/entrance.jpg"
      ]
    }
  ]
}
```

---

### 8. List All Turfs

- **URL**: `GET /api/v3/turfs`
- **Auth**: Optional
- **Query Params**: None
- **Description**: Returns every active turf with owner information and public image URLs so dashboards can render a complete catalog.
- **Success Response (200 OK)**:
```json
{
  "success": true,
  "count": 15,
  "data": [
    {
      "id": "turf-uuid",
      "name": "Champions Arena",
      "city": "Mumbai",
      "address": "123 MG Road",
      "status": "ACTIVE",
      "weekdayDayPrice": 1200,
      "weekdayNightPrice": 1500,
      "weekendDayPrice": 1500,
      "weekendNightPrice": 1800,
      "images": [
        "https://example.com/entrance.jpg",
        "https://example.com/day.jpg"
      ],
      "owner": {
        "name": "Sahil",
        "contactNumber": "+91 9876543210"
      }
    }
  ]
}
```

## 🛠️ Testing with Postman/cURL

### Uploading a Single Image via cURL (New Flow):
```bash
curl -X PATCH http://localhost:3000/api/v3/turfs/YOUR_TURF_ID/upload-image/dayTurf \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/ground_day.jpg"
```

### Uploading Bulk Images via cURL:
```bash
curl -X POST http://localhost:3000/api/v3/turfs/YOUR_TURF_ID/images \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "entrance=@/path/to/entrance.jpg" \
  -F "dayTurf=@/path/to/ground_day.jpg"
```
