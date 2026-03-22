# Turfsy Auth API — Endpoint Test Bodies

Base URL: `http://localhost:3000`

---

## 1. POST /api/v3/auth/login

```
Method  → POST
URL     → http://localhost:3000/api/v3/auth/login
Header  → Content-Type: application/json
```

**USER:**
```json
{
  "phone": "8652601566",
  "role": "USER"
}
```

**OWNER:**
```json
{
  "phone": "8652601566",
  "role": "OWNER"  
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
URL     → http://localhost:3000/api/v3/auth/verify-otp
Header  → Content-Type: application/json
```

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
  "message": "Login successful",
  "accessToken": "eyJhbGci...",
  "role": "USER"
}
```

---

## 3. POST /api/v3/auth/resend-otp

```
Method  → POST
URL     → http://localhost:3000/api/v3/auth/resend-otp
Header  → Content-Type: application/json
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
  "message": "OTP resent successfully",
  "expiresIn": 60
}
```

---

## 4. GET /api/v3/auth/get-me

```
Method  → GET
URL     → http://localhost:3000/api/v3/auth/get-me
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
URL     → http://localhost:3000/api/v3/auth/logout
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
URL     → http://localhost:3000/api/v3/auth/delete-account
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
1. POST /login         → copy sessionToken + check terminal for OTP
2. POST /verify-otp    → copy accessToken
3. GET  /get-me        → use accessToken
4. POST /resend-otp    → use sessionToken
5. GET  /logout        → use accessToken
6. DELETE /delete-account → use both
```