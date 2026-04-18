# 🏟️ Turfsy API Reference: Turf Management

This document serves as the complete reference for all Turf-related endpoints in the system, encompassing creation, retrieval, updates, and media uploads.

**Base URL Space**: `/api/v3/turfs`

---

## 1. 🏗️ Turf Creation & Management

### 1.1 Create a Turf
- **Method**: `POST`
- **Endpoint**: `/api/v3/turfs`
- **Auth**: Required (Owner JWT)
- **Headers**: `Content-Type: multipart/form-data`
- **Description**: Creates a new turf. Accepts standard string/number fields alongside optional images in the exact same request.
- **Form Data Fields**:
  - `name` (String, required)
  - `description` (String, optional)
  - `sportsType` (Enum: `FOOTBALL`, `CRICKET`, required)
  - `turfSize` (String, required) - e.g., "100x60 ft"
  - `address`, `city`, `pincode` (String, required)
  - `lat`, `lng` (Number, required)
  - `openTime`, `closeTime` (String, required) - e.g., "06:00", "23:00"
  - `minSlotDurationMins` (Number, required) - e.g., 60
  - `weekdayDayPrice`, `weekdayNightPrice`, `weekendDayPrice`, `weekendNightPrice` (Number, required)
  - `floodLights`, `parking`, `washroom`, `changingRoom`, `drinkingWater`, `seatingArea`, `cafeteria` (Boolean, optional) - send as `"true"` or `"false"`
- **File Uploads (Optional, attached to the same request)**:
  - `entrance` (File object)
  - `dayTurf` (File object)
  - `nightTurf` (File object)

### 1.2 Update a Turf
- **Method**: `PATCH`
- **Endpoint**: `/api/v3/turfs/:turfId`
- **Auth**: Required (Owner JWT)
- **Headers**: `Content-Type: multipart/form-data` or `application/json`
- **Description**: Updates specific fields of an existing turf. If you want to replace images simultaneously, send as `multipart/form-data`.
- **Note**: Modifying location (`lat`, `lng`) after creation is usually restricted or ignored by this endpoint.

### 1.3 Update Turf Status
- **Method**: `PATCH`
- **Endpoint**: `/api/v3/turfs/:turfId/status`
- **Auth**: Required (Owner JWT)
- **Headers**: `Content-Type: application/json`
- **Body**: 
```json
{
  "status": "ACTIVE" // Options: ACTIVE, INACTIVE, MAINTENANCE
}
```

---

## 2. 🔍 Retrieving Turfs

### 2.1 Get All Turfs
- **Method**: `GET`
- **Endpoint**: `/api/v3/turfs`
- **Auth**: Optional
- **Description**: Retrieves a paginated list of all active turfs on the platform, including their core details, ratings, and image URLs.

### 2.2 Get a Specific Turf
- **Method**: `GET`
- **Endpoint**: `/api/v3/turfs/:turfId`
- **Auth**: Optional
- **Description**: Retrieves the full, detailed profile of a specific turf by its ID. Includes reviews, amenities, video URL, and owner contact details.

### 2.3 Get "My Turfs" (Owner Dashboard)
- **Method**: `GET`
- **Endpoint**: `/api/v3/turfs/my`
- **Auth**: Required (Owner JWT)
- **Description**: Retrieves all turfs owned by the currently authenticated owner. This will include inactive or maintenance turfs as well.

### 2.4 Get Nearby Turfs
- **Method**: `GET`
- **Endpoint**: `/api/v3/turfs/nearby`
- **Auth**: Optional
- **Query Params**:
  - `lat` (Number, required): Latitude of the user.
  - `lng` (Number, required): Longitude of the user.
  - `radiusKm` (Number, optional, default: 10): Search radius in kilometers.

### 2.5 Search Turfs
- **Method**: `GET`
- **Endpoint**: `/api/v3/turfs/search`
- **Auth**: Optional
- **Query Params**:
  - `q` (String, required): The search query (matches against name, city, or sportsType).

### 2.6 Filter Turfs
- **Method**: `GET`
- **Endpoint**: `/api/v3/turfs/filter`
- **Auth**: Optional
- **Query Params**:
  - Filter parameters (e.g., `sportsType=FOOTBALL`, `city=Mumbai`, `maxPrice=1500`, `amenity=parking`).

---

## 3. 📸 Media Uploads & Optimization

All images are converted, optimized to `WEBP`, and resized (Max Width: 800px) before being saved to Supabase Storage.

### 3.1 Upload All Turf Images (Bulk)
- **Method**: `POST`
- **Endpoint**: `/api/v3/turfs/:turfId/images`
- **Auth**: Required (Owner JWT)
- **Headers**: `Content-Type: multipart/form-data`
- **Fields**:
  - `entrance` (File)
  - `dayTurf` (File)
  - `nightTurf` (File)
- **Note**: Will overwrite any existing images mapped to that turf.

### 3.2 Upload/Replace a Single Image
- **Method**: `PATCH`
- **Endpoint**: `/api/v3/turfs/:turfId/upload-image/:type`
- **Auth**: Required (Owner JWT)
- **Path Parameter (`:type`)**: Must be exactly `entrance`, `dayTurf`, or `nightTurf`.
- **Headers**: `Content-Type: multipart/form-data`
- **Fields**:
  - `file` (File) - The single image to upload.

### 3.3 Upload Turf Video
- **Method**: `POST`
- **Endpoint**: `/api/v3/turfs/:turfId/video`
- **Auth**: Required (Owner JWT)
- **Headers**: `Content-Type: multipart/form-data`
- **Fields**:
  - `file` (File - e.g., `.mp4`, `.mov`)
- **Note**: Videos are uploaded directly to the `.mp4` pipeline in Supabase Storage.

### 3.4 Update/Replace Turf Video
- **Method**: `PATCH`
- **Endpoint**: `/api/v3/turfs/:turfId/video`
- **Auth**: Required (Owner JWT)
- **Headers**: `Content-Type: multipart/form-data`
- **Fields**:
  - `file` (File)