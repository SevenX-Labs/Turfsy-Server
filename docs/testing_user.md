# Testing User API (OTP Login -> Verify -> Create Profile)

Base URL:
`http://localhost:3000`

## 1) USER Login (Send OTP)

Endpoint:
`POST /api/v3/auth/user/login`

Body:
```json
{
  "phone": "9876543210"
}
```

cURL:
```bash
curl --location 'http://localhost:3000/api/v3/auth/user/login' \
--header 'Content-Type: application/json' \
--data '{
  "phone": "9876543210"
}'
```

## 2) USER Verify OTP

Endpoint:
`POST /api/v3/auth/user/verify-otp`

Body:
```json
{
  "phone": "9876543210",
  "otp": "123456"
}
```

cURL:
```bash
curl --location 'http://localhost:3000/api/v3/auth/user/verify-otp' \
--header 'Content-Type: application/json' \
--data '{
  "phone": "9876543210",
  "otp": "123456"
}'
```

Expected important field in response:
- `accessToken` (use this in next requests)
- `isNewUser` (for first-time user should be `true`)

## 3) USER Create Profile (New User)

Endpoint:
`POST /api/v3/user-profile`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

Body:
```json
{
  "name": "Test User",
  "email": "testuser@example.com",
  "dob": "2000-01-20",
  "gender": "MALE",
  "currentLat": 28.6139,
  "currentLng": 77.209,
  "currentCity": "New Delhi",
  "preferredSport": "FOOTBALL"
}
```

cURL:
```bash
curl --location 'http://localhost:3000/api/v3/user-profile' \
--header 'Authorization: Bearer <accessToken>' \
--header 'Content-Type: application/json' \
--data '{
  "name": "Test User",
  "email": "testuser@example.com",
  "dob": "2000-01-20",
  "gender": "MALE",
  "currentLat": 28.6139,
  "currentLng": 77.209,
  "currentCity": "New Delhi",
  "preferredSport": "FOOTBALL"
}'
```

## Optional USER endpoints for testing

### Resend OTP
`POST /api/v3/auth/user/resend-otp`

```json
{
  "phone": "9876543210"
}
```

### Get current logged-in user
`GET /api/v3/auth/get-me`

Header:
- `Authorization: Bearer <accessToken>`

### Get created user profile
`GET /api/v3/user-profile`

Header:
- `Authorization: Bearer <accessToken>`

### Update user profile
`PATCH /api/v3/user-profile`

Header:
- `Authorization: Bearer <accessToken>`

Body example:
```json
{
  "name": "Updated User",
  "currentCity": "Mumbai",
  "preferredSport": "CRICKET"
}
```

---

## OWNER New User Flow (if needed)

Use these if you are testing owner app onboarding.

### 1) OWNER Login
`POST /api/v3/auth/owner/login`

```json
{
  "phone": "9123456789"
}
```

### 2) OWNER Verify OTP
`POST /api/v3/auth/owner/verify-otp`

```json
{
  "phone": "9123456789",
  "otp": "123456"
}
```

### 3) OWNER Create Profile
`POST /api/v3/ownerProfile`

Headers:
- `Authorization: Bearer <accessToken>`
- `Content-Type: application/json`

```json
{
  "name": "Owner Test",
  "email": "owner@example.com",
  "contactNumber": "9876543210"
}
```
