# User Profile API — Endpoint Test Guide

Base URL: `http://localhost:3000`

> All endpoints require `Authorization: Bearer <accessToken>`.
> Get your token from `POST /api/v3/auth/verify-otp` → then `POST /api/v3/auth/select-role`.

---

## Recommended Test Flow

```
1. POST  /api/v3/auth/login                     → get sessionToken (check terminal for OTP)
2. POST  /api/v3/auth/verify-otp                → get accessToken
3. POST  /api/v3/auth/select-role  (role: USER) → empty profile row auto-created in DB
4. POST  /api/v3/user-profile                   → create profile (fill in name, email, etc.)
5. POST  /api/v3/user-profile/upload-avatar     → upload image (file name uses profile name)
6. GET   /api/v3/user-profile                   → verify full profile with avatarUrl
7. PATCH /api/v3/user-profile                   → update any fields
8. POST  /api/v3/user-profile/location          → update GPS location
9. POST  /api/v3/user-profile/payment-details   → save UPI ID
10. DELETE /api/v3/user-profile/upload-avatar                      → delete image (avatarUrl → null)
```

> **Upload order note:** Upload avatar after profile creation, so storage file name can include user name.

---

## 1. POST /api/v3/user-profile — Create Profile

> Fills in the profile details first. Then call upload-avatar so file name uses user name.
> Do not pass `avatarUrl` manually here.

```
Method  → POST
URL     → http://localhost:3000/api/v3/user-profile
Headers → Content-Type: application/json
          Authorization: Bearer ACCESS_TOKEN
```

**Request:**

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

| Field            | Type   | Required | Notes                                                   |
| ---------------- | ------ | -------- | ------------------------------------------------------- |
| `name`           | string | ✅       | Full name                                               |
| `email`          | string | ✅       | Must be unique                                          |
| `dob`            | string | ✅       | Format: `"YYYY-MM-DD"`                                  |
| `gender`         | string | ✅       | `MALE` \| `FEMALE` \| `OTHER` \| `PREFER_NOT_TO_SAY`    |
| `preferredSport` | string | ❌       | `CRICKET` \| `FOOTBALL` (used to prioritize home turfs) |
| `currentLat`     | number | ❌       | Decimal latitude                                        |
| `currentLng`     | number | ❌       | Decimal longitude                                       |
| `currentCity`    | string | ❌       | City name                                               |

**Response `201`:**

```json
{
  "success": true,
  "message": "Profile created successfully",
  "data": {
    "id": "uuid",
    "authId": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "avatarUrl": null,
    "dob": "2000-01-15T00:00:00.000Z",
    "gender": "MALE",
    "preferredSport": "CRICKET",
    "currentLat": 19.076,
    "currentLng": 72.8777,
    "currentCity": "Mumbai",
    "createdAt": "2026-03-25T13:00:00.000Z",
    "updatedAt": "2026-03-25T13:00:00.000Z"
  }
}
```

---

## 2. POST /api/v3/user-profile/upload-avatar — Upload Profile Picture

> Stores image in Supabase Storage → `uploads/users/{authId}/{user-name}.jpg` (or `.png`/`.webp`)
> Saves public URL as `avatarUrl` in DB. **No image binary in DB.**
> File name uses profile `name` (sanitized to lowercase slug). Re-upload keeps only one avatar file.

```
Method  → POST
URL     → http://localhost:3000/api/v3/user-profile/upload-avatar
Headers → Authorization: Bearer ACCESS_TOKEN
Body    → form-data
```

**form-data:**

| Key    | Type | Value                    |
| ------ | ---- | ------------------------ |
| `file` | File | Select image from device |

**Allowed types:** `image/jpeg` · `image/jpg` · `image/png` · `image/webp`
**Max size:** `5 MB`

**Response `200`:**

```json
{
  "success": true,
  "avatarUrl": "https://zgryqgoajdousrqdofcs.supabase.co/storage/v1/object/public/uploads/users/{authId}/john-doe.jpg"
}
```

**Errors:**
| Status | Reason |
|---|---|
| `400` | Field name wrong (must be `file`) / invalid type / exceeds 5 MB / profile name not set |
| `401` | Missing or invalid token |
| `404` | Profile row not found (did you call select-role first?) |
| `500` | Supabase upload failed |

---

## 3. DELETE /api/v3/user-profile/upload-avatar — Delete Profile Picture

> Removes image from Supabase Storage and sets `avatarUrl = null` in DB.

```
Method  → DELETE
URL     → http://localhost:3000/api/v3/user-profile/upload-avatar
Headers → Authorization: Bearer ACCESS_TOKEN
```

No body.

**Response `200`:**

```json
{
  "success": true,
  "message": "Profile image deleted successfully"
}
```

---

## 4. GET /api/v3/user-profile — Get Own Profile

```
Method  → GET
URL     → http://localhost:3000/api/v3/user-profile
Headers → Authorization: Bearer ACCESS_TOKEN
```

No body.

**Response `200`:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "authId": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "avatarUrl": "https://zgryqgoajdousrqdofcs.supabase.co/storage/v1/object/public/uploads/users/{authId}/john-doe.jpg",
    "dob": "2000-01-15T00:00:00.000Z",
    "gender": "MALE",
    "currentLat": 19.076,
    "currentLng": 72.8777,
    "currentCity": "Mumbai",
    "createdAt": "2026-03-25T13:00:00.000Z",
    "updatedAt": "2026-03-25T13:00:00.000Z",
    "payment": null
  }
}
```

---

## 5. PATCH /api/v3/user-profile — Update Profile

> Send only the fields you want to update.

```
Method  → PATCH
URL     → http://localhost:3000/api/v3/user-profile
Headers → Content-Type: application/json
          Authorization: Bearer ACCESS_TOKEN
```

**Request:** (any subset)

```json
{
  "name": "John Updated",
  "email": "john.new@example.com",
  "currentCity": "Pune"
}
```

**Response `200`:**

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "id": "uuid",
    "name": "John Updated",
    "email": "john.new@example.com",
    "currentCity": "Pune"
  }
}
```

---

## 6. POST /api/v3/user-profile/location — Update Location

```
Method  → POST
URL     → http://localhost:3000/api/v3/user-profile/location
Headers → Content-Type: application/json
          Authorization: Bearer ACCESS_TOKEN
```

**Request:**

```json
{
  "lat": 18.5204,
  "lng": 73.8567,
  "city": "Pune"
}
```

| Field  | Type   | Required |
| ------ | ------ | -------- |
| `lat`  | number | ✅       |
| `lng`  | number | ✅       |
| `city` | string | ❌       |

**Response `200`:**

```json
{
  "success": true,
  "message": "Location updated successfully",
  "data": { "lat": 18.5204, "lng": 73.8567, "city": "Pune" }
}
```

---

## 7. POST /api/v3/user-profile/payment-details — Save UPI

```
Method  → POST
URL     → http://localhost:3000/api/v3/user-profile/payment-details
Headers → Content-Type: application/json
          Authorization: Bearer ACCESS_TOKEN
```

**Request:**

```json
{
  "upiId": "john@ybl"
}
```

**Response `200`:**

```json
{
  "success": true,
  "message": "Payment details saved successfully",
  "data": { "upiId": "john@ybl" }
}
```

---

## Storage Reference

```
Bucket  : uploads
Path    : users/{authId}/{user-name}.{ext}
Access  : Public (must be enabled in Supabase Dashboard → Storage)
```

> Uploading a new image keeps only one file inside `users/{authId}/` (old avatar file is deleted first).
> The `authId` comes from the JWT automatically — you never pass it manually.
