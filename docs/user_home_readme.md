# User Home API — `user-home_readme.md`

Base URL: `https://turfsy.onrender.com`

---

## Overview

`GET /api/v3/user-home` returns every dashboard section (top-recommended, most-rated, budget-friendly, nearby, most-demanded, newly-opened, recently-viewed) in a single response. Auth is optional; query params override saved profile location, while each section remains available independently via its own URL.

---

## Table of Contents

1. [Endpoint](#endpoint)
2. [Query Parameters](#query-parameters)
3. [Section Endpoints](#section-endpoints)
4. [Testing Endpoints](#testing-endpoints)
5. [Response](#response)
6. [Authentication](#authentication)

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
| Query Params| `lat`, `lng`, `city`, `radiusKm`   |

---

## Query Parameters

| Param  | Type   | Required | Constraint    | Description                                           |
|--------|--------|----------|---------------|-------------------------------------------------------|
| `lat`  | float  | ❌        | -90 to 90     | User's current latitude (takes priority for nearest). |
| `lng`  | float  | ❌        | -180 to 180   | User's current longitude.                             |
| `city` | string | ❌        | trimmed       | Fallback city when GPS is missing.                    |
| `radiusKm` | float | ❌    | 1–15          | Nearby radius when using `lat`/`lng` (defaults to 5). |

**Location priority**: GPS query params > saved profile location > no location (nearby omitted).

---

## Section Endpoints

Each section has a dedicated URL that returns `{ success, userCity, section }` so you can fetch just one list when necessary.

| Section | Endpoint |
| --- | --- |
| Top Recommended | `GET /api/v3/user-home/top-recommended` |
| Most Rated | `GET /api/v3/user-home/most-rated` |
| Budget Friendly | `GET /api/v3/user-home/budget-friendly` |
| Nearby | `GET /api/v3/user-home/nearby` |
| Most Demanded | `GET /api/v3/user-home/most-demanded` |
| Newly Opened | `GET /api/v3/user-home/newly-opened` |
| Recently Viewed | `GET /api/v3/user-home/recently-viewed` |

Use `/api/v3/user-home/nearby` with `lat`/`lng`/`radiusKm` when you only need nearby cards; it filters by the provided coordinate (or by city when GPS is absent) and caps the list at 10 turfs.

---

## Testing Endpoints

For debugging you can hit these section-specific turf APIs to validate the underlying lists.

| Section | Endpoint |
| --- | --- |
| Nearby | `GET /api/v3/turfs/nearby?lat=19.0760&lng=72.8777&radius=5000` |
| Most Rated | `GET /api/v3/turfs/most-rated` |
| Budget Friendly | `GET /api/v3/turfs/budget-friendly` |
| Most Demanded | `GET /api/v3/turfs/most-demanded` |
| Newly Opened | `GET /api/v3/turfs/newly-joined` |
| Recently Viewed | `GET /api/v3/turfs/recently-viewed` |

These help verify each filter before combining them via the dashboard endpoint.

---

## Response

```json
{
  "success": true,
  "userCity": "Mumbai",
  "sections": [
    {
      "sectionType": "nearby",
      "title": "Nearby Turfs",
      "turfs": [ /* TurfCard objects */ ]
    }
  ]
}
```

Each `TurfCard` contains the turf metadata listed in `docs/turf_creation_readme.md`’s details (images, pricing, owner contact, etc.). Sections with 0 turfs are omitted automatically.

---

## Authentication

`/api/v3/user-home` and its section endpoints use `OptionalJwtAuthGuard`; a missing/invalid token is silently ignored, but when a valid JWT is provided we use the saved profile location to populate the nearby section if location query params are absent.
