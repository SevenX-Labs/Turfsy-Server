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

Returns owner profile + `payment` + `turfs`.

## 3. Update Owner Profile

`PATCH /api/v3/ownerProfile`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Request (any subset):
```json
{
  "name": "Rahul Shah Updated",
  "email": "rahulnew@example.com",
  "contactNumber": "9876543210"
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
