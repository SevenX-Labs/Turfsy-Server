# Owner Profile API - Endpoint Test Guide

Base URL: `http://localhost:3000`

All owner profile endpoints require:
- `Authorization: Bearer <accessToken>`

Get owner token from:
1. `POST /api/v3/auth/owner/login`
2. `POST /api/v3/auth/owner/verify-otp`

There is no `/api/v3/auth/select-role` in current code.

## A) Owner Profile Endpoints

## 1. Create Owner Profile

`POST /api/v3/ownerProfile`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Request:
```json
{
  "name": "Rahul Shah",
  "email": "rahul@example.com",
  "contactNumber": "9876543210"
}
```

Important rule:
- `contactNumber` must match the verified login phone number.

## 2. Get Owner Profile

`GET /api/v3/ownerProfile`

Headers:
- `Authorization: Bearer <accessToken>`


Reponse :
```json
{
  "success": true,
  "data": {
    "id": "e67417e5-...",
    "authId": "auth-5...",
    "name": "Jane Owner",
    "email": "jane@turfsy.com",
    "contactNumber": "9876543210",
    "avatarUrl": "https://example.com/avatar.jpg",
    "aadharNumber": "123456789012",
    "aadharUrl": "https://example.com/aadhar-doc.jpg",
    "isKycVerified": false,
    "createdAt": "2026-04-18T10:00:00.000Z",
    "updatedAt": "2026-04-18T10:00:00.000Z",
    "payment": {
      "id": "pay-123",
      "authId": "auth-5...",
      "role": "OWNER",
      "upiId": null,
      "userProfileId": null,
      "ownerProfileId": "e67417e5-...",
      "bankHolderName": "Jane Owner",
      "bankName": "HDFC Bank",
      "accountNumber": "50100123456789",
      "ifscCode": "HDFC0001234",
      "payoutMethod": "UPI",
      "payoutFrequency": "MANUAL",
      "isActive": true,
      "createdAt": "2026-04-18T10:00:00.000Z",
      "updatedAt": "2026-04-18T10:00:00.000Z"
    },
    "turfs": [
      {
        "id": "turf-123",
        "ownerProfileId": "e67417e5-...",
        "name": "Super Arena",
        "description": "A wonderful football turf",
        "sportsType": "FOOTBALL",
        "turfSize": "5v5",
        "status": "ACTIVE",
        "address": "123 Main St",
        "city": "Mumbai",
        "pincode": "400001",
        "lat": 19.076,
        "lng": 72.8777,
        "openTime": "06:00",
        "closeTime": "23:00",
        "minSlotDurationMins": 60,
        "weekdayDayPrice": 1000,
        "weekdayNightPrice": 1200,
        "weekendDayPrice": 1500,
        "weekendNightPrice": 1800,
        "createdAt": "2026-04-18T09:00:00.000Z",
        "updatedAt": "2026-04-18T09:00:00.000Z"
      }
    ]
  }
}
```

Returns owner profile + `payment` + `turfs`.

## 3. Update Owner Profile

`PATCH /api/v3/ownerProfile`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Request (any subset):
```json
{
  "name": "Jane Owner",
  "email": "jane@turfsy.com",
  "contactNumber": "9876543210",
  "avatarUrl": "https://example.com/avatar.jpg",
  "aadharNumber": "123456789012",
  "aadharUrl": "https://example.com/aadhar-doc.jpg",
  "bankHolderName": "Jane Owner",
  "bankName": "HDFC Bank",
  "accountNumber": "50100123456789",
  "ifscCode": "HDFC0001234",
  "upiId": "jane.owner@okhdfc" 
}
```

Reponse :
```json
{
  "success": true,
  "message": "Owner profile updated successfully",
  "data": {
    "id": "e67417e5-...",
    "authId": "auth-5...",
    "name": "Jane Owner",
    "email": "jane@turfsy.com",
    "contactNumber": "9876543210",
    "avatarUrl": "https://example.com/avatar.jpg",
    "aadharNumber": "123456789012",
    "aadharUrl": "https://example.com/aadhar-doc.jpg",
    "isKycVerified": false,
    "createdAt": "2026-04-18T10:00:00.000Z",
    "updatedAt": "2026-04-18T10:00:00.000Z",
    "payment": {
      "id": "pay-123",
      "authId": "auth-5...",
      "role": "OWNER",
      "upiId": null,
      "userProfileId": null,
      "ownerProfileId": "e67417e5-...",
      "bankHolderName": "Jane Owner",
      "bankName": "HDFC Bank",
      "accountNumber": "50100123456789",
      "ifscCode": "HDFC0001234",
      "payoutMethod": "UPI",
      "payoutFrequency": "MANUAL",
      "isActive": true,
      "createdAt": "2026-04-18T10:00:00.000Z",
      "updatedAt": "2026-04-18T10:00:00.000Z"
    }
  }
}
```

Note:
- If `contactNumber` is sent, it must still match verified login phone.

## 4. Save Payment Details

`POST /api/v3/ownerProfile/payment-details`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Request:
```json
{
  "upiId": "rahul@upi"
}
```

Success response:
```json
{
  "success": true,
  "message": "Payment details saved successfully",
  "data": {
    "upiId": "rahul@upi"
  }
}
```

## B) Owner Turf Endpoints (Current Code)

Turf endpoints are under `/api/v3/turfs`, not `/api/v3/ownerProfile/turfs`.

## 5. Create Turf

`POST /api/v3/turfs`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: multipart/form-data`

Body:
- Turf fields from `CreateTurfDto`
- Optional image files at create time:
  - `entrance`
  - `dayTurf`
  - `nightTurf`

## 6. Get My Turfs

`GET /api/v3/turfs/my`

Headers:
- `Authorization: Bearer <accessToken>`

## 7. Update Turf

`PATCH /api/v3/turfs/:turfId`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: multipart/form-data`

Supports turf field updates + optional image replacements (`entrance`, `dayTurf`, `nightTurf`).

## 8. Update Turf Status

`PATCH /api/v3/turfs/:turfId/status`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Request:
```json
{
  "status": "ACTIVE"
}
```

Allowed values:
- `ACTIVE`
- `INACTIVE`

## 9. Upload Turf Images

`POST /api/v3/turfs/:turfId/images`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: multipart/form-data`

Form-data keys:
- `entrance` (optional)
- `dayTurf` (optional)
- `nightTurf` (optional)

At least one image is required.

Current file size limit in controller:
- `5 MB`

## 10. Upload Single Turf Image

`PATCH /api/v3/turfs/:turfId/upload-image/:type`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: multipart/form-data`

Path param `type`:
- `entrance`
- `dayTurf`
- `nightTurf`

Form-data key:
- `file`

## Current Test Order

1. `POST /api/v3/auth/owner/login`
2. `POST /api/v3/auth/owner/verify-otp`
3. `POST /api/v3/ownerProfile`
4. `POST /api/v3/ownerProfile/payment-details`
5. `POST /api/v3/turfs`
6. `POST /api/v3/turfs/:turfId/images`
7. `PATCH /api/v3/turfs/:turfId/status`
8. `GET /api/v3/ownerProfile`
9. `PATCH /api/v3/ownerProfile`
10. `PATCH /api/v3/turfs/:turfId`
