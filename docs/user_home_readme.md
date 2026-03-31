# User Home API — `user-home_readme.md`

Base URL: `https://turfsy.onrender.com`

---

## Table of Contents

1. [Overview](#overview)
2. [Where to Place the Guard File](#where-to-place-the-guard-file)
3. [Endpoint](#endpoint)
4. [Query Parameters](#query-parameters)
5. [All Test Cases — Postman / Thunder Client / cURL](#all-test-cases)
6. [Full Response Structure](#full-response-structure)
7. [TurfCard Object Reference](#turfcard-object-reference)
8. [Section Logic Reference](#section-logic-reference)
9. [Error Responses](#error-responses)
10. [AppModule Registration](#appmodule-registration)
11. [Full File Structure](#full-file-structure)
12. [Future Enhancements](#future-enhancements)

---

## Overview

The User Home endpoint returns **all 6 personalised home sections** for the Turfsy app in a **single API call**.

- No separate calls per section
- Auth is optional — works for both guests and logged-in users
- Location comes from query params OR saved profile — no extra call needed
- Sections with 0 results are automatically removed from the response

---



## Endpoint

```
GET /api/v3/user-home
```

| Property    | Value                              |
|-------------|------------------------------------|
| Method      | `GET`                              |
| Auth        | Optional (JWT Bearer Token)        |
| Body        | None                               |
| Query Params| `lat`, `lng`, `city` (all optional)|

---

## Query Parameters

| Param  | Type   | Required | Validation               | Description                                |
|--------|--------|----------|--------------------------|--------------------------------------------|
| `lat`  | float  | ❌        | -90 to 90                | User's current latitude  e.g. `19.0760`    |
| `lng`  | float  | ❌        | -180 to 180              | User's current longitude e.g. `72.8777`    |
| `city` | string | ❌        | trimmed string           | User's current city e.g. `Mumbai`          |

**Location priority (highest to lowest):**
1. Query params `?lat=&lng=` — always wins
2. Saved `UserProfile.currentLat / currentLng / currentCity` — used if logged in and no query params
3. No location — nearby section returns empty, all others work normally

---

## Testing Endpoints

While `/api/v3/user-home` aggregates every section, the following turf-specific endpoints help you validate each slice independently during development or QA.

| Section | Endpoint | Purpose |
| --- | --- | --- |
| Nearby | `GET /api/v3/turfs/nearby?lat=19.0760&lng=72.8777&radius=5000` | Confirms nearby turfs + `distanceKm` logic. |
| Most Rated | `GET /api/v3/turfs/most-rated` | Returns turfs ordered by rating (then reviews). |
| Budget Friendly | `GET /api/v3/turfs/budget-friendly` | Surfacing `weekdayDayPrice ≤ ₹800` options. |
| Most Demanded | `GET /api/v3/turfs/most-demanded` | Uses demand score (reviews × rating) until booking data exists. |
| Newly Opened | `GET /api/v3/turfs/newly-joined` | Shows turfs created within the last 30 days. |
| Recently Viewed (demo) | `GET /api/v3/turfs/recently-viewed` | Demo endpoint for recency-based cards — useful for mocking user behavior and matching the home page layout. |

Run these before or alongside the home endpoint to verify section-specific expectations.

---

## Testing Request Body

| Endpoint | Body |
| --- | --- |
| `GET /api/v3/user-home` | None (all inputs come through query params or saved profile). |
| `GET /api/v3/turfs/nearby` | None (pass `lat`, `lng`, `radius` via query string). |
| `GET /api/v3/turfs/most-rated` | None |
| `GET /api/v3/turfs/budget-friendly` | None |
| `GET /api/v3/turfs/most-demanded` | None |
| `GET /api/v3/turfs/newly-joined` | None |
| `GET /api/v3/turfs/recently-viewed` | None (demo endpoint; server returns sample payload). |

## All Test Cases

### ─────────────────────────────────────────
### TEST 1 — Anonymous user, with GPS location
### ─────────────────────────────────────────

```
Method  → GET
URL     → https://turfsy.onrender.com/api/v3/user-home?lat=19.0760&lng=72.8777&city=Mumbai
Headers → (none required)
Body    → (none)
```

**What to expect:**
- All 6 sections returned
- Nearby shows turfs within 15km of `19.0760, 72.8777`
- `distanceKm` populated on every turf card
- `userCity` = `"Mumbai"`

**cURL:**
```bash
curl -X GET \
  "https://turfsy.onrender.com/api/v3/user-home?lat=19.0760&lng=72.8777&city=Mumbai" \
  -H "Content-Type: application/json"
```

---

### ─────────────────────────────────────────
### TEST 2 — Logged-in user, uses saved profile location (no query params)
### ─────────────────────────────────────────

```
Method  → GET
URL     → https://turfsy.onrender.com/api/v3/user-home
Headers → Authorization: Bearer ACCESS_TOKEN_FROM_VERIFY_OTP
Body    → (none)
```

**What to expect:**
- Uses `currentLat`, `currentLng`, `currentCity` from `UserProfile` (set via `/api/v3/user-profile/location`)
- If profile has no saved location → nearby section returns empty, all others work
- `userCity` = whatever is saved in the profile

**cURL:**
```bash
curl -X GET \
  "https://turfsy.onrender.com/api/v3/user-home" \
  -H "Authorization: Bearer eyJhbGci..."
```

---

### ─────────────────────────────────────────
### TEST 3 — Logged-in user, override location via query params
### ─────────────────────────────────────────

```
Method  → GET
URL     → https://turfsy.onrender.com/api/v3/user-home?lat=18.5204&lng=73.8567&city=Pune
Headers → Authorization: Bearer ACCESS_TOKEN_FROM_VERIFY_OTP
Body    → (none)
```

**What to expect:**
- Query params take priority over saved profile location
- Nearby shows turfs within 15km of Pune coordinates
- `userCity` = `"Pune"`

**cURL:**
```bash
curl -X GET \
  "https://turfsy.onrender.com/api/v3/user-home?lat=18.5204&lng=73.8567&city=Pune" \
  -H "Authorization: Bearer eyJhbGci..."
```

---

### ─────────────────────────────────────────
### TEST 4 — Anonymous user, city only (no GPS)
### ─────────────────────────────────────────

```
Method  → GET
URL     → https://turfsy.onrender.com/api/v3/user-home?city=Mumbai
Headers → (none)
Body    → (none)
```

**What to expect:**
- Nearby section uses city-name fallback (shows turfs where `city = "Mumbai"`)
- `distanceKm` = `null` on all cards (no GPS to calculate from)
- `userCity` = `"Mumbai"`
- All other sections work normally (rating, budget, etc.)

**cURL:**
```bash
curl -X GET \
  "https://turfsy.onrender.com/api/v3/user-home?city=Mumbai"
```

---

### ─────────────────────────────────────────
### TEST 5 — Anonymous user, no location at all
### ─────────────────────────────────────────

```
Method  → GET
URL     → https://turfsy.onrender.com/api/v3/user-home
Headers → (none)
Body    → (none)
```

**What to expect:**
- `nearby` section is MISSING from response (0 turfs → auto-excluded)
- All other 5 sections return normally
- `userCity` = `null`
- `distanceKm` = `null` on all cards

**cURL:**
```bash
curl -X GET "https://turfsy.onrender.com/api/v3/user-home"
```

---

### ─────────────────────────────────────────
### TEST 6 — Invalid coordinates (edge case / validation test)
### ─────────────────────────────────────────

```
Method  → GET
URL     → https://turfsy.onrender.com/api/v3/user-home?lat=999&lng=abc
Headers → (none)
Body    → (none)
```

**What to expect:**
- Invalid `lat=999` (out of -90/90 range) and `lng=abc` (not a number) are silently ignored
- Falls back to no-location behaviour
- Returns 200 with sections, nearby excluded
- No 400/500 error — safe degradation

---

### ─────────────────────────────────────────
### TEST 7 — Only lat provided, lng missing (partial coords)
### ─────────────────────────────────────────

```
Method  → GET
URL     → https://turfsy.onrender.com/api/v3/user-home?lat=19.0760
Headers → (none)
Body    → (none)
```

**What to expect:**
- Both `lat` AND `lng` are required for GPS mode
- With only `lat`, GPS mode is skipped
- Falls back to no-location behaviour (nearby excluded)

---

### Postman Collection Setup

```
Collection Name: Turfsy - User Home
Base URL Variable: {{base_url}} = https://turfsy.onrender.com
Token Variable: {{access_token}} = paste from verify-otp response

Requests:
1. GET {{base_url}}/api/v3/user-home?lat=19.0760&lng=72.8777&city=Mumbai
   (no auth header)

2. GET {{base_url}}/api/v3/user-home
   Header: Authorization: Bearer {{access_token}}

3. GET {{base_url}}/api/v3/user-home?lat=18.5204&lng=73.8567&city=Pune
   Header: Authorization: Bearer {{access_token}}

4. GET {{base_url}}/api/v3/user-home?city=Mumbai
   (no auth header)

5. GET {{base_url}}/api/v3/user-home
   (no auth, no params — tests empty nearby)
```

---

### Recommended Test Order (Full Flow)

```
Step 1.  POST /api/v3/auth/login                     → get OTP (check terminal)
Step 2.  POST /api/v3/auth/verify-otp                → get accessToken
Step 3.  POST /api/v3/auth/select-role  {role: USER} → creates empty profile
Step 4.  POST /api/v3/user-profile                   → create profile with name/email/dob
Step 5.  POST /api/v3/user-profile/location          → save lat/lng/city to profile
Step 6.  GET  /api/v3/user-home                      → logged-in test (uses saved location)
Step 7.  GET  /api/v3/user-home?lat=19.0760&lng=72.8777&city=Mumbai → override test
Step 8.  GET  /api/v3/user-home?city=Mumbai          → city-only fallback test
Step 9.  GET  /api/v3/user-home                      → anonymous test (no auth, no params)
```

---

## Full Response Structure

```json
{
  "success": true,
  "userCity": "Mumbai",
  "sections": [
    {
      "sectionType": "top_recommended",
      "title": "Top Recommended",
      "subtitle": "Best turfs handpicked for you",
      "turfs": [
        {
          "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
          "name": "Green Arena",
          "city": "Mumbai",
          "address": "123, MG Road, Andheri East",
          "distanceKm": 2.34,
          "rating": 4.5,
          "reviewCount": 18,
          "sportsType": "FOOTBALL",
          "turfSize": "100x60 ft",
          "status": "ACTIVE",
          "openTime": "06:00",
          "closeTime": "23:00",
          "weekdayDayPrice": 800,
          "weekdayNightPrice": 1200,
          "weekendDayPrice": 1000,
          "weekendNightPrice": 1500,
          "floodLights": true,
          "parking": true,
          "washroom": true,
          "changingRoom": false,
          "drinkingWater": true,
          "seatingArea": false,
          "cafeteria": false,
          "images": [
            "https://zgryqgoajdousrqdofcs.supabase.co/storage/v1/object/public/uploads/turfs/a1b2c3d4/entrance.jpg",
            "https://zgryqgoajdousrqdofcs.supabase.co/storage/v1/object/public/uploads/turfs/a1b2c3d4/dayTurf.jpg",
            "https://zgryqgoajdousrqdofcs.supabase.co/storage/v1/object/public/uploads/turfs/a1b2c3d4/nightTurf.jpg"
          ],
          "owner": {
            "name": "Rahul Shah",
            "contactNumber": "9876543210"
          },
          "createdAt": "2026-03-01T10:00:00.000Z"
        }
      ]
    },
    {
      "sectionType": "most_rated",
      "title": "Most Rated",
      "subtitle": "Highest rated turfs by players",
      "turfs": [ ]
    },
    {
      "sectionType": "budget_friendly",
      "title": "Budget Friendly",
      "subtitle": "Quality turfs under ₹800/hr",
      "turfs": [ ]
    },
    {
      "sectionType": "nearby",
      "title": "Nearby Turfs",
      "subtitle": "Turfs within 15 km of you",
      "turfs": [ ]
    },
    {
      "sectionType": "most_demanded",
      "title": "Most Demanded",
      "subtitle": "Popular turfs players love to book",
      "turfs": [ ]
    },
    {
      "sectionType": "newly_opened",
      "title": "Newly Opened",
      "subtitle": "Fresh turfs added in the last 30 days",
      "turfs": [ ]
    }
  ]
}
```

> **Note:** `sections` with 0 turfs are excluded automatically. If DB has no turfs at all, `sections` = `[]`.

---

## TurfCard Object Reference

| Field               | Type             | Nullable | Description                                       |
|---------------------|------------------|----------|---------------------------------------------------|
| `id`                | string (uuid)    | No       | Turf unique ID                                    |
| `name`              | string           | No       | Turf name                                         |
| `city`              | string           | No       | City where turf is located                        |
| `address`           | string           | No       | Full street address                               |
| `distanceKm`        | float \| null    | Yes      | Distance from user. `null` if no user location    |
| `rating`            | float            | No       | Average rating 0–5. `0` if no reviews yet         |
| `reviewCount`       | number           | No       | Total number of reviews. `0` if none              |
| `sportsType`        | `FOOTBALL` \| `CRICKET` | No | Sport type                                   |
| `turfSize`          | string           | No       | e.g. `"100x60 ft"`                                |
| `status`            | `ACTIVE`         | No       | Always ACTIVE (inactive filtered out)             |
| `openTime`          | string           | No       | 24hr format e.g. `"06:00"`                        |
| `closeTime`         | string           | No       | 24hr format e.g. `"23:00"`                        |
| `weekdayDayPrice`   | float            | No       | Price per hour, weekday day slot                  |
| `weekdayNightPrice` | float            | No       | Price per hour, weekday night slot                |
| `weekendDayPrice`   | float            | No       | Price per hour, weekend day slot                  |
| `weekendNightPrice` | float            | No       | Price per hour, weekend night slot                |
| `floodLights`       | boolean          | No       | Amenity flag                                      |
| `parking`           | boolean          | No       | Amenity flag                                      |
| `washroom`          | boolean          | No       | Amenity flag                                      |
| `changingRoom`      | boolean          | No       | Amenity flag                                      |
| `drinkingWater`     | boolean          | No       | Amenity flag                                      |
| `seatingArea`       | boolean          | No       | Amenity flag                                      |
| `cafeteria`         | boolean          | No       | Amenity flag                                      |
| `images`            | string[]         | No       | Array of public Supabase image URLs (0–3 items)   |
| `owner.name`        | string           | No       | Owner's display name                              |
| `owner.contactNumber` | string         | No       | Owner's contact number                            |
| `createdAt`         | ISO datetime     | No       | Turf creation timestamp                           |

---

## Section Logic Reference

| Section             | Algorithm                                                                        | Filter                                        | Limit |
|---------------------|----------------------------------------------------------------------------------|-----------------------------------------------|-------|
| **top_recommended** | Weighted: `rating×0.5 + reviewCount×0.2 + proximityBonus×0.3` → DESC            | rating ≥ 3.5 OR zero reviews (new turf bonus) | 10    |
| **most_rated**      | `rating DESC` → `reviewCount DESC` as tiebreaker                                 | None                                          | 10    |
| **budget_friendly** | `weekdayDayPrice ASC`                                                            | `weekdayDayPrice ≤ ₹800`                      | 10    |
| **nearby**          | `distanceKm ASC` (Haversine) — city match if no GPS                              | GPS: ≤ 15km radius — City: exact city match   | 10    |
| **most_demanded**   | `demandScore = reviewCount×0.6 + (rating/5×100)×0.4` → DESC                     | None (swap for booking count when available)  | 10    |
| **newly_opened**    | `createdAt DESC`                                                                 | `createdAt` within last 30 days               | 10    |

**Haversine formula** is used for all distance calculations — accurate great-circle distance, rounded to 2 decimal places.

---

## Error Responses

| Status | When                                              | Body                                                                          |
|--------|---------------------------------------------------|-------------------------------------------------------------------------------|
| `200`  | Always on success (even if all sections empty)    | `{ success: true, userCity: null, sections: [] }`                             |
| `500`  | DB is down or prisma throws unexpectedly          | `{ statusCode: 500, message: "Failed to load home data. Please try again." }` |

> There is intentionally no `400` from this endpoint. Invalid query params degrade gracefully to no-location mode.

---

## AppModule Registration

```typescript
// src/app.module.ts

import { Module } from '@nestjs/common';
import { UserHomeModule } from './user-home/user-home.module';
// ... your other imports

@Module({
  imports: [
    // ... your existing modules (PrismaModule, AuthModule, etc.)
    UserHomeModule,   // ← add this line
  ],
})
export class AppModule {}
```

---

## Full File Structure

```
src/
├── app.module.ts                          ← import UserHomeModule here
│
├── auth/
│   ├── guards/
│   │   ├── jwt-auth.guard.ts              ← your existing guard (unchanged)
│   │   └── optional-jwt-auth.guard.ts     ← NEW: place here
│   ├── strategies/
│   │   └── jwt.strategy.ts               ← your existing strategy (unchanged)
│   ├── auth.controller.ts
│   ├── auth.module.ts                    ← unchanged, already exports JwtStrategy
│   └── auth.service.ts
│
└── user-home/
    ├── dto/
    │   ├── turf-card.dto.ts              ← TurfCard shape
    │   ├── user-home-response.dto.ts     ← top-level API response
    │   └── user-home-section.dto.ts      ← section wrapper
    ├── types/
    │   └── home-section.enum.ts          ← HomeSectionType enum
    ├── user-home.controller.ts           ← GET /api/v3/user-home
    ├── user-home.module.ts               ← imports PrismaModule + AuthModule
    └── user-home.service.ts              ← all 6 section algorithms
```

---

## Future Enhancements

1. **Most Demanded** — When `Booking` model is added, replace demand score formula with `_count: { bookings: true }` → sort by `bookingCount DESC`.
2. **Top Recommended** — Add booking completion rate as a 4th signal in the weighted score.
3. **Redis Caching** — Wrap `getHomeSections()` with a 5-minute TTL cache keyed by city. Reduces DB load dramatically at scale.
4. **Pagination per section** — Add `?page=&limit=` query params for infinite scroll inside each section.
5. **Sport filter** — Add `?sportsType=CRICKET` to filter all sections by sport type.