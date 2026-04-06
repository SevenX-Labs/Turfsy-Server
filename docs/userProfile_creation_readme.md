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
4. `POST /api/v3/user-profile`
5. `POST /api/v3/user-profile/upload-avatar`
6. `GET /api/v3/user-profile`
7. `PATCH /api/v3/user-profile`
8. `POST /api/v3/user-profile/location`
9. `POST /api/v3/user-profile/payment-details`
10. `DELETE /api/v3/user-profile/upload-avatar`

## 1. Get Current Account (phone included)

`GET /api/v3/auth/get-me`

Headers:
- `Authorization: Bearer <accessToken>`

Notes:
- Returns `data.phone` (the same mobile number used at login).
- Returns `data.profile` and `data.payment`.

## 2. Create Profile

`POST /api/v3/user-profile`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Request:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "dob": "2000-01-15",
  "gender": "MALE",
  "preferredSport": "CRICKET",
  "currentLat": 19.076,
  "currentLng": 72.8777,
  "currentCity": "Mumbai"
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
  "name": "John Updated",
  "email": "john.new@example.com",
  "currentCity": "Pune",
  "preferredSport": "FOOTBALL"
}
```

## 7. Update Location

`POST /api/v3/user-profile/location`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Request:
```json
{
  "lat": 18.5204,
  "lng": 73.8567,
  "city": "Pune"
}
```

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
