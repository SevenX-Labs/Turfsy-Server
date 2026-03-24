# User Profile API

All endpoints require authentication (JWT in Authorization header).

---

## 1. Create User Profile

**POST** `/api/v3/user-profile`

**Headers:**
`Authorization: Bearer <accessToken>`

**Body:**
```json
{
	"name": "John Doe",
	"email": "john@example.com",
	"dob": "2000-01-01",
	"gender": "MALE",
	"currentLat": 19.123,
	"currentLng": 72.456,
	"currentCity": "Mumbai"
}
```
**Success Response:**
```json
{
	"success": true,
	"message": "Profile created successfully",
	"data": { /* user profile object */ }
}
```

---

## 2. Get Own Profile

**GET** `/api/v3/user-profile`

**Headers:**
`Authorization: Bearer <accessToken>`

**Success Response:**
```json
{
	"success": true,
	"data": { /* user profile object, includes payment if set */ }
}
```

---

## 3. Update User Profile

**PATCH** `/api/v3/user-profile`

**Headers:**
`Authorization: Bearer <accessToken>`

**Body:** (any subset of fields)
```json
{
	"name": "Jane Doe",
	"email": "jane@example.com",
	"dob": "1999-12-31",
	"gender": "FEMALE",
	"currentLat": 20.123,
	"currentLng": 73.456,
	"currentCity": "Pune"
}
```
**Success Response:**
```json
{
	"success": true,
	"data": { /* updated user profile object */ }
}
```

---

## 4. Save UPI Payment Details

**POST** `/api/v3/user-profile/payment-details`

**Headers:**
`Authorization: Bearer <accessToken>`

**Body:**
```json
{
	"upiId": "john@upi"
}
```
**Success Response:**
```json
{
	"success": true,
	"message": "Payment details saved successfully"
}
```

---

## 5. Update Location

**POST** `/api/v3/user-profile/location`

**Headers:**
`Authorization: Bearer <accessToken>`

**Body:**
```json
{
	"lat": 19.123,
	"lng": 72.456,
	"city": "Mumbai"
}
```
**Success Response:**
```json
{
	"success": true,
	"message": "Location updated successfully"
}
```

---

## 6. Upload User Avatar

**PATCH** `/api/v3/user-profile/upload-avatar`

**Headers:**
`Authorization: Bearer <accessToken>`
`Content-Type: multipart/form-data`

**Body (form-data):**
```
Key: avatar
Value: [Your Image File (jpg/png/webp), Max 5MB]
```

**Success Response:**
```json
{
  "success": true,
  "message": "Avatar updated successfully",
  "data": {
    "avatarUrl": "https://turfsy.onrender.com/uploads/avatars/YOUR_AUTH_ID-123456789.jpg"
  }
}
```
