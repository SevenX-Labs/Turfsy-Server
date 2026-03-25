# Turfsy Auth API — Endpoint Test Bodies

Base URL: `https://turfsy.onrender.com`

---

## 1. POST /api/v3/auth/login

```
Method  → POST
URL     → https://turfsy.onrender.com/api/v3/auth/login
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
  "sessionToken": "uuid",
  "expiresIn": 60
}
```

---

## 2. POST /api/v3/auth/verify-otp

```
Method  → POST
URL     → https://turfsy.onrender.com/api/v3/auth/verify-otp
Header  → Content-Type: application/json
```

**Request:**
```json
{
  "phone": "8652601566",
  "otp": "OTP_FROM_TERMINAL"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP verified",
  "accessToken": "eyJhbGci..." // JWT token, use this for authenticated requests
}
```
## 3. POST /api/v3/auth/select-role

```
Method  → POST
URL     → https://turfsy.onrender.com/api/v3/auth/select-role
Header  → Content-Type: application/json
         Authorization: Bearer ACCESS_TOKEN_FROM_VERIFY
```

**Request:**
```json
{
  "role": "USER"
}
```

**Response:**
```json
{
  "role": "USER",
  "isNewUser": true,
  "profile": null,
  "accessToken": "eyJhbGci..." // JWT token (if you want to re-issue or confirm)
}
```

---

## 3. POST /api/v3/auth/resend-otp

```
Method  → POST
URL     → https://turfsy.onrender.com/api/v3/auth/resend-otp
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

## 4. GET /api/v3/auth/get-me

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

## 5. GET /api/v3/auth/logout

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

## 6. DELETE /api/v3/auth/delete-account

```
Method  → DELETE
URL     → https://turfsy.onrender.com/api/v3/auth/delete-account
Header  → Content-Type: application/json
         Authorization: Bearer ACCESS_TOKEN_FROM_VERIFY
```

```json
{
  "sessionToken": "SESSION_TOKEN_FROM_LOGIN"
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

## Test Order

```
1. POST /login         → check terminal for OTP
2. POST /verify-otp    → copy accessToken (uses phone + otp)
3. POST /select-role   → use accessToken, select role, get isNewUser/profile
4. GET  /get-me        → use accessToken
5. POST /resend-otp    → uses phone
6. GET  /logout        → use accessToken
7. DELETE /delete-account → use accessToken (requires sessionToken body if testing deletion)
```