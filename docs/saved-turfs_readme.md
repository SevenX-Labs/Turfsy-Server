# Saved Turfs API Documentation

This module allows authenticated users to save ("bookmark" or "favorite") turfs for quick access later.

## 1. Save a Turf
Marks a turf as saved for the currently authenticated user.

- **URL:** `/api/v3/saved-turfs/:turfId`
- **Method:** `POST`
- **Auth required:** Yes (`Bearer Token`)

### Request Parameters
| Name     | Type   | Location | Description                        |
|----------|--------|----------|------------------------------------|
| `turfId` | string | URL Path | The unique ID of the turf to save. |

### Request Body (Optional)
```json
{
  "notes": "Great ground for weekend evening matches."
}
```

### Success Response
- **Code:** `201 CREATED`
- **Content:**
```json
{
  "success": true,
  "message": "Turf saved successfully",
  "data": {
    "id": "uuid-of-saved-record",
    "userId": "uuid-of-auth-user",
    "turfId": "uuid-of-turf",
    "notes": "Great ground for weekend evening matches.",
    "createdAt": "2026-04-01T12:00:00.000Z"
  }
}
```

### Error Responses
- **Code:** `401 UNAUTHORIZED` (Missing or invalid token)
- **Code:** `404 NOT FOUND` (Turf does not exist in the database)
- **Code:** `409 CONFLICT` (The user has already saved this turf)

---

## 2. Unsave (Remove) a Turf
Removes a turf from the user's saved list.

- **URL:** `/api/v3/saved-turfs/:turfId`
- **Method:** `DELETE`
- **Auth required:** Yes (`Bearer Token`)

### Request Parameters
| Name     | Type   | Location | Description                          |
|----------|--------|----------|--------------------------------------|
| `turfId` | string | URL Path | The unique ID of the turf to remove. |

### Success Response
- **Code:** `200 OK`
- **Content:**
```json
{
  "success": true,
  "message": "Turf unsaved successfully"
}
```

### Error Responses
- **Code:** `401 UNAUTHORIZED` (Missing or invalid token)
- **Code:** `404 NOT FOUND` (The turf was not previously saved by this user)

---

## 3. Get All Saved Turfs
Retrieves all the turfs the authenticated user has saved, sorted by the most recent save first.

- **URL:** `/api/v3/saved-turfs`
- **Method:** `GET`
- **Auth required:** Yes (`Bearer Token`)

### Success Response
- **Code:** `200 OK`
- **Content:**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "savedId": "uuid-of-saved-record",
      "savedAt": "2026-04-01T12:00:00.000Z",
      "notes": "Great ground for weekend evening matches.",
      "turfDetails": {
        "id": "uuid-of-turf",
        "name": "Super Turf Arena",
        "description": "A premium sports complex.",
        "sportsType": "FOOTBALL",
        "turfSize": "100x60 ft",
        "address": "123 Main St",
        "city": "Mumbai",
        "pincode": "400001",
        "lat": 19.0760,
        "lng": 72.8777,
        "openTime": "06:00",
        "closeTime": "23:00",
        "minSlotDurationMins": 60,
        "status": "ACTIVE",
        "weekdayDayPrice": 1200,
        "weekdayNightPrice": 1500,
        "weekendDayPrice": 1500,
        "weekendNightPrice": 2000,
        "images": [
          "https://example.com/entrance.jpg",
          "https://example.com/dayTurf.jpg"
        ],
        "owner": {
          "name": "Owner Name",
          "contactNumber": "9876543210"
        }
      }
    }
  ]
}
```

### Error Responses
- **Code:** `401 UNAUTHORIZED` (Missing or invalid token)
