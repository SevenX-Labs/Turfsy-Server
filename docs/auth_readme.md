# Turfsy Auth API - Test Guide

Base URL: `http://localhost:3000`

All auth endpoints are under: `/api/v3/auth`

## Role Flow (Important)

Role is decided by endpoint:
- User app: `/api/v3/auth/user/*`
- Owner app: `/api/v3/auth/owner/*`

There is no `/select-role` endpoint in current code.

## 1. User Login (Send OTP)

`POST /api/v3/auth/user/login`

Request:
```json
{
  "phone": "9876543210"
}
```

Success response:
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresIn": 60
}
```

## 2. User Verify OTP

`POST /api/v3/auth/user/verify-otp`

Request:
```json
{
  "phone": "9876543210",
  "otp": "123456"
}
```

Success response:
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "accessToken": "eyJhbGci...",
  "role": "USER",
  "isNewUser": true,
  "auth": {
    "id": "auth-uuid",
    "phone": "9876543210",
    "role": "USER"
  }
}
```

## 3. User Resend OTP

`POST /api/v3/auth/user/resend-otp`

Request:
```json
{
  "phone": "9876543210"
}
```

Success response:
```json
{
  "success": true,
  "message": "OTP resent successfully",
  "expiresIn": 60
}
```

## 4. Owner Login (Send OTP)

`POST /api/v3/auth/owner/login`

Request:
```json
{
  "phone": "9123456789"
}
```

## 5. Owner Verify OTP

`POST /api/v3/auth/owner/verify-otp`

Request:
```json
{
  "phone": "9123456789",
  "otp": "123456"
}
```

Success response shape is same as user verify, with `role: "OWNER"`.

## 6. Owner Resend OTP

`POST /api/v3/auth/owner/resend-otp`

Request:
```json
{
  "phone": "9123456789"
}
```

## 7. Get Current Account

`GET /api/v3/auth/get-me`

Header:
- `Authorization: Bearer <accessToken>`

Returns auth info plus role-based profile and payment. It includes the login `phone` in `data`.

Sample response:
```json
{
  "success": true,
  "data": {
    "id": "3810354a-a2d0-4964-bba4-19a218b205ed",
    "phone": "8652601566",
    "role": "USER",
    "isVerified": true,
    "isActive": true,
    "createdAt": "2026-04-06T14:28:03.715Z",
    "updatedAt": "2026-04-06T14:28:22.472Z",
    "deletedAt": null,
    "profile": {
      "id": "d3c13f36-39be-4a61-a225-33845ae84d81",
      "authId": "3810354a-a2d0-4964-bba4-19a218b205ed",
      "name": "Sahil Hode",
      "email": "sahilhode67@gmail.com",
      "avatarUrl": "https://zgryqgoajdousrqdofcs.supabase.co/storage/v1/object/public/uploads/users/3810354a-a2d0-4964-bba4-19a218b205ed/sahil-hode.jpg",
      "dob": "2000-01-20T00:00:00.000Z",
      "gender": "MALE",
      "preferredSport": "CRICKET",
      "currentLat": 28.6139,
      "currentLng": 77.209,
      "currentCity": "New Delhi",
      "createdAt": "2026-04-06T14:30:25.867Z",
      "updatedAt": "2026-04-06T14:32:23.802Z"
    },
    "payment": null
  }
}
```

## 8. Logout

`GET /api/v3/auth/logout`

Header:
- `Authorization: Bearer <accessToken>`

Success response:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## 9. Delete Account

`DELETE /api/v3/auth/delete-account`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Request:
```json
{
  "sessionToken": "any-string"
}
```

Success response:
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

## 10. Request Phone Change

`POST /api/v3/auth/request-phone-change`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Request:
```json
{
  "newPhone": "9988776655"
}
```

Success response:
```json
{
  "success": true,
  "message": "OTP sent to 9988776655",
  "sessionToken": "session-token",
  "newPhone": "9988776655",
  "expiresIn": 60
}
```

## 11. Verify Phone Change

`POST /api/v3/auth/verify-phone-change`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Request:
```json
{
  "sessionToken": "session-token",
  "newPhone": "9988776655",
  "otp": "123456"
}
```

Success response:
```json
{
  "success": true,
  "message": "Phone number updated successfully",
  "data": {
    "phone": "9988776655"
  }
}
```

## Validation Notes

- `phone` must be a valid Indian mobile number (`en-IN`).
- `otp` must be exactly 6 characters.
