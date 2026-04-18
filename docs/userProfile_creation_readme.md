# User Profile API - Endpoint Test Guide

Base URL: `http://localhost:3000`

All endpoints require:
- `Authorization: Bearer <accessToken>`

Get token from:
1. `POST /api/v3/auth/user/login`
2. `POST /api/v3/auth/user/verify-otp`

There is no `/api/v3/auth/select-role` in current code.

## Recommended Test Flow

1. `POST /api/v3/auth/user/login`
2. `POST /api/v3/auth/user/verify-otp`
3. `GET /api/v3/auth/get-me` (shows login phone in `data.phone`)
5. `GET /api/v3/user-profile/check-availability?username=<your_username>`
6. `POST /api/v3/user-profile` (Sync GPS data + set username)
7. `PATCH /api/v3/user-profile/address` (Add House/Society details)
8. `POST /api/v3/user-profile/upload-avatar`
9. `GET /api/v3/user-profile`
10. `PATCH /api/v3/user-profile` (General updates/change username)
11. `POST /api/v3/user-profile/payment-details`
12. `DELETE /api/v3/user-profile/upload-avatar`

## 1. Get Current Account (phone included)

`GET /api/v3/auth/get-me`

Headers:
- `Authorization: Bearer <accessToken>`

Notes:
- Returns `data.phone` (the same mobile number used at login).
- Returns `data.profile` and `data.payment`.

## 1.1 Check Username Availability

`GET /api/v3/user-profile/check-availability`

**Query Params:**
- `username`: The username to check (e.g., `Sahil-123`)

**Rules:**
- **Length**: 4–20 characters.
- **Allowed**: letters (uppercase + lowercase), numbers, and `_`, `@`, `$`, `-`.
- **Forbidden**: spaces and all other special characters.

**Rate Limit**: 10 requests per minute per IP.

**Example Response (Available):**
```json
{
  "available": true,
  "message": "Username is available"
}
```

**Example Response (Taken):**
```json
{
  "available": false,
  "message": "Username is already taken"
}
```

## 2. Create Profile

`POST /api/v3/user-profile`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Request:
```json
{
  "username": "John-99",
  "name": "John Doe",
  "email": "john@example.com",
  "dob": "2000-01-15",
  "gender": "MALE",
  "preferredSport": "CRICKET",
  "currentLat": 19.076,
  "currentLng": 72.8777,
  "city": "Mumbai",
  "state": "Maharashtra",
  "pincode": "400001"
}
```

Rules:
- `gender`: `MALE | FEMALE | OTHER | PREFER_NOT_TO_SAY`
- `preferredSport`: `FOOTBALL | CRICKET` (optional)

Success response:
```json
{
  "success": true,
  "message": "Profile created successfully",
  "data": {
    "id": "uuid",
    "authId": "uuid",
    "username": "John-99",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

## 3. Upload Avatar

`POST /api/v3/user-profile/upload-avatar`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: multipart/form-data`

form-data:
- `file` (required)

Allowed types:
- `image/jpeg`, `image/jpg`, `image/png`, `image/webp`

Max size:
- `5 MB`

## 4. Delete Avatar

`DELETE /api/v3/user-profile/upload-avatar`

Headers:
- `Authorization: Bearer <accessToken>`

## 5. Get Profile

`GET /api/v3/user-profile`

Headers:
- `Authorization: Bearer <accessToken>`

Success response:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "authId": "uuid",
    "username": "John-99",
    "name": "John Doe",
    "email": "john@example.com",
    "payment": null
  }
}
```

## 6. Update Profile

`PATCH /api/v3/user-profile`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Request (any subset):
```json
{
  "username": "John-New-Handle",
  "name": "John Updated",
  "email": "john.new@example.com",
  "city": "Pune",
  "preferredSport": "FOOTBALL"
}
```

## 7. Update Detailed Address

`PATCH /api/v3/user-profile/address`

Use this when the user fills in the "remaining part" of their address manually.

Request:
```json
{
  "houseNumber": "B-402",
  "societyName": "Royal Residency",
  "landmark": "Near Sky Mall",
  "roadName": "Main Link Road"
}
```

**Note:** The backend automatically joins these fields into a single `address` string in the database.
```

`PATCH /api/v3/user-profile/address` (with lat/lng keys or just query `PATCH /user-profile`)
## 8. Save Payment Details

`POST /api/v3/user-profile/payment-details`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Request:
```json
{
  "upiId": "john@ybl"
}
```

Success response:
```json
{
  "success": true,
  "message": "Payment details saved successfully",
  "data": {
    "upiId": "john@ybl"
  }
}
```
