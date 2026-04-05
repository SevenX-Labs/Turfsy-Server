# Turfsy User Settings API

Base URL: `/api/v3`  
Auth: `Authorization: Bearer <token>` for all endpoints

## 1. Profile (Keep Existing)

Use profile APIs only for basic user information.

### `GET /api/v3/user-profile`

Purpose:

- Fetch user basic profile, avatar, and linked info.

Response:

```json
{
  "success": true,
  "message": "Profile fetched successfully",
  "data": {
    "name": "Sahil",
    "email": "sahil@example.com",
    "avatarUrl": "https://cdn.turfsy.com/user/avatar.jpg",
    "dob": "2000-10-10T00:00:00.000Z",
    "gender": "MALE"
  }
}
```

### `PATCH /api/v3/user-profile`

Purpose:

- Update only basic profile fields.

Request body:

```json
{
  "name": "Sahil Hode",
  "email": "sahil.hode@example.com",
  "avatarUrl": "https://cdn.turfsy.com/user/new-avatar.jpg"
}
```

Response:

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "name": "Sahil Hode",
    "email": "sahil.hode@example.com",
    "avatarUrl": "https://cdn.turfsy.com/user/new-avatar.jpg"
  }
}
```

## 2. Payment Settings (New Separate)

Do not mix payment settings with profile.

### `GET /api/v3/user-settings/payment`

Purpose:

- Fetch user payment settings.

Response:

```json
{
  "success": true,
  "data": {
    "upiId": "sahil@upi",
    "defaultPaymentMethod": "UPI"
  }
}
```

### `PATCH /api/v3/user-settings/payment`

Purpose:

- Update UPI and default payment method.

Request body:

```json
{
  "upiId": "newid@oksbi",
  "defaultPaymentMethod": "UPI"
}
```

Response:

```json
{
  "success": true,
  "message": "Payment settings updated",
  "data": {
    "upiId": "newid@oksbi",
    "defaultPaymentMethod": "UPI"
  }
}
```

## 3. Security Settings (New)

Keep sensitive actions isolated.

### `POST /api/v3/user-settings/change-password`

Request body:

```json
{
  "currentPassword": "OldPassword@123",
  "newPassword": "NewPassword@456"
}
```

Response:

```json
{
  "success": true,
  "message": "Password change is not applicable for OTP-based login. Use change-phone for login credential updates."
}
```

### `POST /api/v3/user-settings/change-phone`

This endpoint supports a two-step secure flow:

- Step 1: request OTP by sending only `newPhone`
- Step 2: verify change by sending `newPhone + otp + sessionToken`

Request body:

```json
{
  "newPhone": "9876543210"
}
```

Response:

```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "sessionToken": "phone-change-session-token"
  }
}
```

Verify request body:

```json
{
  "newPhone": "9876543210",
  "otp": "123456",
  "sessionToken": "phone-change-session-token"
}
```

Verify response:

```json
{
  "success": true,
  "message": "Phone number changed successfully",
  "data": {
    "phone": "9876543210"
  }
}
```

## 4. Preferences (New - Important)

### `GET /api/v3/user-settings/preferences`

Response:

```json
{
  "success": true,
  "data": {
    "notificationsEnabled": true,
    "preferredTime": "EVENING",
    "favoriteSport": "FOOTBALL",
    "favoriteTurfIds": ["a6c1edc8-a5b8-4966-8660-5b6a5d2751b0"]
  }
}
```

### `PATCH /api/v3/user-settings/preferences`

Request body:

```json
{
  "notificationsEnabled": false,
  "preferredTime": "MORNING",
  "favoriteSport": "CRICKET",
  "favoriteTurfIds": ["b7c2edc8-a5b8-4966-8660-5b6a5d2751c1"]
}
```

Response:

```json
{
  "success": true,
  "message": "Preferences updated",
  "data": {
    "notificationsEnabled": false,
    "preferredTime": "MORNING",
    "favoriteSport": "CRICKET",
    "favoriteTurfIds": ["b7c2edc8-a5b8-4966-8660-5b6a5d2751c1"]
  }
}
```

## 5. Notification Settings (Optional Split)

### `GET /api/v3/user-settings/notifications`

Response:

```json
{
  "success": true,
  "data": {
    "bookingAlerts": true,
    "offerAlerts": true,
    "reminderAlerts": true
  }
}
```

### `PATCH /api/v3/user-settings/notifications`

Request body:

```json
{
  "bookingAlerts": true,
  "offerAlerts": false,
  "reminderAlerts": true
}
```

Response:

```json
{
  "success": true,
  "message": "Notification settings updated",
  "data": {
    "bookingAlerts": true,
    "offerAlerts": false,
    "reminderAlerts": true
  }
}
```

## 6. Activity (Do Not Duplicate)

Reuse existing booking module APIs:

- `GET /api/v3/booking/my-bookings`
- `GET /api/v3/booking/transaction-history`

No new activity endpoints required under user-settings.

## 7. Account Actions (Keep Existing)

Reuse existing auth APIs:

- `GET /api/v3/auth/logout`
- `DELETE /api/v3/auth/delete-account`

## Final UI to API Mapping

| UI Section    | API                                     |
| ------------- | --------------------------------------- |
| Profile       | `/api/v3/user-profile`                  |
| Payment       | `/api/v3/user-settings/payment`         |
| Security      | `/api/v3/user-settings/change-password` |
| Preferences   | `/api/v3/user-settings/preferences`     |
| Notifications | `/api/v3/user-settings/notifications`   |
| Bookings      | `/api/v3/booking/my-bookings`           |
| Transactions  | `/api/v3/booking/transaction-history`   |

## Notes

- Existing endpoints already available in code: `/api/v3/user-profile`, `/api/v3/booking/my-bookings`, `/api/v3/booking/transaction-history`, `/api/v3/auth/logout`, `/api/v3/auth/delete-account`.
- New `/api/v3/user-settings/*` endpoints in this document are the target contract for the user settings module implementation.
