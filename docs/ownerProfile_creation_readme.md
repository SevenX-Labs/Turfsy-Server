# Owner Profile API

All endpoints require authentication (JWT in Authorization header).
Role must be **OWNER** (set via `/api/v3/auth/select-role`).

Base URL: `https://turfsy.onrender.com`

---

## 1. Create Owner Profile

**POST** `/api/v3/ownerProfile`

**Headers:**
`Authorization: Bearer <accessToken>`
`Content-Type: application/json`

**Body:**
```json
{
  "name": "Rahul Shah",
  "email": "rahul@example.com",
  "contactNumber": "9876543210",
  "aadharNumber": "123456789012"
}
```

> ⚠️ Can only be called once. Profile is considered "created" once `name` is set.
> Avatar is uploaded separately via the `upload-avatar` endpoint.

**Success Response:**
```json
{
  "success": true,
  "message": "Owner profile created successfully",
  "data": {
    "id": "uuid",
    "authId": "uuid",
    "name": "Rahul Shah",
    "email": "rahul@example.com",
    "contactNumber": "9876543210",
    "aadharNumber": "123456789012",
    "avatarUrl": "",
    "isKycVerified": false,
    "createdAt": "2026-03-24T...",
    "updatedAt": "2026-03-24T..."
  }
}
```

---

## 2. Get Own Profile

**GET** `/api/v3/ownerProfile`

**Headers:**
`Authorization: Bearer <accessToken>`

No body.

**Success Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "authId": "uuid",
    "name": "Rahul Shah",
    "email": "rahul@example.com",
    "contactNumber": "9876543210",
    "avatarUrl": "https://turfsy.onrender.com/uploads/avatars/owners/uuid-123.jpg",
    "isKycVerified": false,
    "turfs": [ /* array of turf objects */ ],
    "payment": { "upiId": "rahul@upi" }
  }
}
```

---

## 3. Update Owner Profile

**PATCH** `/api/v3/ownerProfile`

**Headers:**
`Authorization: Bearer <accessToken>`
`Content-Type: application/json`

**Body:** (any subset of fields)
```json
{
  "name": "Rahul Shah Updated",
  "email": "rahulnew@example.com",
  "contactNumber": "9123456789"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Owner profile updated successfully",
  "data": { /* updated owner profile object */ }
}
```

---

## 4. Upload Owner Avatar

**PATCH** `/api/v3/ownerProfile/upload-avatar`

**Headers:**
`Authorization: Bearer <accessToken>`
`Content-Type: multipart/form-data`

**Body (form-data):**
```
Key:   avatar
Value: [Image File — jpg/jpeg/png/webp, Max 5MB]
```

**Success Response:**
```json
{
  "success": true,
  "message": "Avatar updated successfully",
  "data": {
    "avatarUrl": "https://turfsy.onrender.com/uploads/avatars/owners/uuid-123456789.jpg"
  }
}
```

---

## 5. Save Payment Details (UPI)

**POST** `/api/v3/ownerProfile/payment-details`

**Headers:**
`Authorization: Bearer <accessToken>`
`Content-Type: application/json`

**Body:**
```json
{
  "upiId": "rahul@upi"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Payment details saved successfully",
  "data": {
    "upiId": "rahul@upi"
  }
}
```

---

## 6. Create Turf

**POST** `/api/v3/ownerProfile/turfs`

**Headers:**
`Authorization: Bearer <accessToken>`
`Content-Type: application/json`

> ⚠️ Owner must have a completed profile (name set) before creating a turf.
> Turf images are uploaded separately via `/turfs/:turfId/images`.

**Body:**
```json
{
  "name": "Green Arena",
  "description": "Premium football turf with floodlights",
  "sportsType": "FOOTBALL",
  "turfSize": "100x60 ft",
  "address": "123, MG Road",
  "city": "Mumbai",
  "pincode": "400001",
  "lat": 19.076,
  "lng": 72.877,
  "openTime": "06:00",
  "closeTime": "23:00",
  "minSlotDurationMins": 60,
  "floodLights": true,
  "parking": true,
  "washroom": true,
  "changingRoom": false,
  "drinkingWater": true,
  "seatingArea": false,
  "cafeteria": false,
  "weekdayDayPrice": 800,
  "weekdayNightPrice": 1200,
  "weekendDayPrice": 1000,
  "weekendNightPrice": 1500
}
```

**Enum values:**
- `sportsType`: `FOOTBALL` | `CRICKET`

**Success Response:**
```json
{
  "success": true,
  "message": "Turf created successfully",
  "data": {
    "id": "uuid",
    "ownerProfileId": "uuid",
    "name": "Green Arena",
    "status": "ACTIVE",
    "groundDayUrl": "",
    "entranceUrl": "",
    ...
  }
}
```

---

## 7. Get All My Turfs

**GET** `/api/v3/ownerProfile/turfs`

**Headers:**
`Authorization: Bearer <accessToken>`

No body.

**Success Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Green Arena",
      "city": "Mumbai",
      "status": "ACTIVE",
      "sportsType": "FOOTBALL",
      "weekdayDayPrice": 800,
      ...
    }
  ]
}
```

---

## 8. Update Turf

**PATCH** `/api/v3/ownerProfile/turfs/:turfId`

**Headers:**
`Authorization: Bearer <accessToken>`
`Content-Type: application/json`

**Body:** (any subset of turf fields)
```json
{
  "name": "Green Arena Elite",
  "weekdayDayPrice": 900,
  "floodLights": true,
  "closeTime": "23:30"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Turf updated successfully",
  "data": { /* updated turf object */ }
}
```

---

## 9. Upload Turf Images

**POST** `/api/v3/ownerProfile/turfs/:turfId/images`

**Headers:**
`Authorization: Bearer <accessToken>`
`Content-Type: multipart/form-data`

**Body (form-data — all fields optional, at least one required):**
```
Key: groundDay     → [Image File — main ground day photo]
Key: groundNight   → [Image File — ground night photo]
Key: entrance      → [Image File — entrance photo]
Key: seatingArea   → [Image File — seating area photo]
```

> Max file size: 10MB per image. Formats: jpg/jpeg/png/webp.

**Success Response:**
```json
{
  "success": true,
  "message": "Turf images updated successfully",
  "data": {
    "groundDayUrl": "https://turfsy.onrender.com/uploads/turfs/uuid-123.jpg",
    "groundNightUrl": "https://turfsy.onrender.com/uploads/turfs/uuid-456.jpg",
    "entranceUrl": "https://turfsy.onrender.com/uploads/turfs/uuid-789.jpg",
    "seatingAreaUrl": null
  }
}
```

---

## 10. Update Turf Status

**PATCH** `/api/v3/ownerProfile/turfs/:turfId/status`

**Headers:**
`Authorization: Bearer <accessToken>`
`Content-Type: application/json`

**Body:**
```json
{
  "status": "ACTIVE"
}
```

**Enum values:**
- `status`: `ACTIVE` | `INACTIVE`

**Success Response:**
```json
{
  "success": true,
  "message": "Turf status updated to ACTIVE",
  "data": {
    "id": "uuid",
    "status": "ACTIVE"
  }
}
```

---

## Test Order

```
1. POST /select-role           → role: "OWNER"
2. POST /ownerProfile          → fill name, email, contact, aadhar
3. PATCH /ownerProfile/upload-avatar  → upload profile picture
4. POST /ownerProfile/payment-details → save UPI ID
5. POST /ownerProfile/turfs    → create turf (no images yet)
6. POST /ownerProfile/turfs/:id/images → upload ground/entrance photos
7. PATCH /ownerProfile/turfs/:id/status → toggle ACTIVE/INACTIVE when needed
8. GET  /ownerProfile          → verify full profile with turfs + payment
9. PATCH /ownerProfile         → update any profile field anytime
10. PATCH /ownerProfile/turfs/:id → update any turf field anytime
```
