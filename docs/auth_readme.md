# Turfsy Auth API — Endpoint Test Bodies

Base URL: `https://turfsy.onrender.com`

---

## Auth Split (Important)

Role is selected by endpoint, not by request body:

- User app uses `/api/v3/auth/user/*`
- Owner app uses `/api/v3/auth/owner/*`
- No `/select-role` step in this flow

---

## 1. POST /api/v3/auth/user/login

```
Method  → POST
URL     → https://turfsy.onrender.com/api/v3/auth/user/login
Header  → Content-Type: application/json
```

**Request:**
```json
{
  "phone": "8652601566"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresIn": 60
}
```

---

## 2. POST /api/v3/auth/user/verify-otp

```
Method  → POST
URL     → https://turfsy.onrender.com/api/v3/auth/user/verify-otp
Header  → Content-Type: application/json
```

**Request:**
```json
{
  "phone": "8652601566",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "accessToken": "eyJhbGci...",
  "role": "USER",
  "isNewUser": true,
  "profile": null
}
```

---

## 3. POST /api/v3/auth/user/resend-otp

```
Method  → POST
URL     → https://turfsy.onrender.com/api/v3/auth/user/resend-otp
Header  → Content-Type: application/json
```

**Request:**
```json
{
  "phone": "8652601566"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP resent successfully",
  "expiresIn": 60
}
```

---

## 4. POST /api/v3/auth/owner/login

```
Method  → POST
URL     → https://turfsy.onrender.com/api/v3/auth/owner/login
Header  → Content-Type: application/json
```

**Request:**
```json
{
  "phone": "8652601566"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "expiresIn": 60
}
```

---

## 5. POST /api/v3/auth/owner/verify-otp

```
Method  → POST
URL     → https://turfsy.onrender.com/api/v3/auth/owner/verify-otp
Header  → Content-Type: application/json
```

**Request:**
```json
{
  "phone": "8652601566",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "accessToken": "eyJhbGci...",
  "role": "OWNER",
  "isNewUser": true,
  "profile": null
}
```

---

## 6. POST /api/v3/auth/owner/resend-otp

```
Method  → POST
URL     → https://turfsy.onrender.com/api/v3/auth/owner/resend-otp
Header  → Content-Type: application/json
```

**Request:**
```json
{
  "phone": "8652601566"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP resent successfully",
  "expiresIn": 60
}
```

---

## 7. GET /api/v3/auth/get-me

```
Method  → GET
URL     → https://turfsy.onrender.com/api/v3/auth/get-me
Header  → Authorization: Bearer ACCESS_TOKEN_FROM_VERIFY
```

No body.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "phone": "8652601566",
    "role": "USER",
    "isVerified": true,
    "isActive": true,
    "profile": {
      "id": "uuid",
      "name": "",
      "email": ""
    },
    "payment": null
  }
}
```

---

## 8. GET /api/v3/auth/logout

```
Method  → GET
URL     → https://turfsy.onrender.com/api/v3/auth/logout
Header  → Authorization: Bearer ACCESS_TOKEN_FROM_VERIFY
```

No body.

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 9. DELETE /api/v3/auth/delete-account

```
Method  → DELETE
URL     → https://turfsy.onrender.com/api/v3/auth/delete-account
Header  → Content-Type: application/json
         Authorization: Bearer ACCESS_TOKEN_FROM_VERIFY
```

**Request:**
```json
{
  "sessionToken": "any-string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

---

## Test Order (User App)

```
1. POST /user/login       → check terminal/SMS for OTP
2. POST /user/verify-otp  → copy accessToken
3. GET  /get-me           → use accessToken
4. POST /user/resend-otp  → uses phone (when needed)
5. GET  /logout           → use accessToken
6. DELETE /delete-account → use accessToken
```

## Test Order (Owner App)

```
1. POST /owner/login       → check terminal/SMS for OTP
2. POST /owner/verify-otp  → copy accessToken
3. GET  /get-me            → use accessToken
4. POST /owner/resend-otp  → uses phone (when needed)
5. GET  /logout            → use accessToken
6. DELETE /delete-account  → use accessToken
```
