# Turfsy Search & Filter API Documentation

This document outlines the endpoints available for discovering turfs based on keywords or advanced dynamic filtering and sorting. You can hand this directly to the frontend engineering team.

## 1. Basic Text Search
**Endpoint:** `GET /api/v3/turfs/search`

Designed for the main search bar where users type a turf name.

### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | `string` | **Yes** | The search keyword (e.g., "arena", "stadium"). Performs a case-insensitive partial match on the turf name. |

### Example Request
```http
GET /api/v3/turfs/search?q=kickoff
```

---

## 2. Advanced Filtration & Sorting
**Endpoint:** `GET /api/v3/turfs/filter`

Designed for the heavily structured filter screens (e.g., filtering by city, price ranges, sport types) and dynamic sorting (like Flipkart/Amazon).

### Query Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `city` | `string` | No | Exact match filter for city (case-insensitive). |
| `sportsType` | `enum` | No | Match the sport type (e.g., `CRICKET`, `FOOTBALL`). |
| `minPrice` | `number` | No | Minimum price threshold (`weekdayDayPrice`). |
| `maxPrice` | `number` | No | Maximum price limit (`weekdayDayPrice`). |
| `sortBy` | `string` | No | Sorting behavior. Values: `price_low`, `price_high`, `popular` (most saved/bookmarked turfs), `distance` (nearest first), `newest` (default). |
| `userLat` | `number` | No* | User's latitude. **Required if `sortBy=distance`**. |
| `userLng` | `number` | No* | User's longitude. **Required if `sortBy=distance`**. |

*Note: If `userLat` and `userLng` are provided (even if not sorting by distance), the backend will automatically append a calculated `distanceKm` property to each returned turf so the frontend UI can display "X km away".*

### Example Request (Price Range & Popularity)
```http
GET /api/v3/turfs/filter?city=Mumbai&sportsType=FOOTBALL&minPrice=800&maxPrice=1500&sortBy=popular
```

### Example Request (Nearest Location)
```http
GET /api/v3/turfs/filter?sortBy=distance&userLat=19.0760&userLng=72.8777
```

---

## 3. Response Format
Both endpoints return the exact same predictable array structure so the frontend can reuse the same Turf Card component for both screens.

```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "id": "uuid-here",
      "ownerProfileId": "uuid",
      "name": "Kickoff Arena",
      "description": "Premium 5v5 turf in the heart of the city.",
      "sportsType": "FOOTBALL",
      "turfSize": "100x60",
      "city": "Mumbai",
      "lat": 19.0760,
      "lng": 72.8777,
      "weekdayDayPrice": 1200,
      "status": "ACTIVE",
      "distanceKm": 5.2, 
      "images": [
         "https://url-to-entrance.jpg", 
         "https://url-to-ground-day.jpg"
      ],
      "rating": 0,
      "reviewCount": 0,
      "createdAt": "2026-04-02T13:00:00.000Z"
    }
  ]
}
```
*Note: `distanceKm` will solely be present in the response if `userLat` and `userLng` coordinates were included in the request query.*
