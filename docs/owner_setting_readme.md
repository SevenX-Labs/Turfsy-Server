# Turfsy API - Owner Settings Module

**Base URL Context:** `{{BASE_URL}}/api/v3/owner-settings`

All endpoints are protected and require a valid `Bearer Token` belonging to an `OWNER` role.

---

## 1. Profile Settings

### Get Owner Profile
*   **URL:** `GET /api/v3/owner-settings/profile`
*   **Description:** Fetch basic owner profile details.
*   **Response:**
    ```json
    {
      "success": true,
      "data": {
        "name": "John Doe",
        "email": "john@example.com",
        "contactNumber": "9876543210"
      }
    }
    ```

### Update Owner Profile
*   **URL:** `PATCH /api/v3/owner-settings/profile`
*   **Description:** Update basic profile details. 
*   **Body:**
    ```json
    {
      "name": "John Doe",
      "email": "john.new@example.com",
      "phone": "9876543210" // Ignored/Handled securely via phone flow
    }
    ```
*   **Response:**
    ```json
    {
      "success": true,
      "message": "Profile settings updated successfully",
      "data": {
        "name": "John Doe",
        "email": "john.new@example.com",
        "contactNumber": "9876543210"
      }
    }
    ```

---

## 2. Turf Management

### View Turf Settings
*   **URL:** `GET /api/v3/owner-settings/turf/:turfId`
*   **Description:** Get turf details and dynamic pricing settings.
*   **Response:**
    ```json
    {
      "success": true,
      "data": {
        "id": "turf_uuid",
        "name": "Kickoff Arena",
        "description": "Premium 5v5 turf",
        "weekdayDayPrice": 1000,
        "weekdayNightPrice": 1200,
        "weekendDayPrice": 1200,
        "weekendNightPrice": 1500,
        "openTime": "06:00",
        "closeTime": "23:00",
        "groundDayUrl": "https://url.to.img/...",
        "groundNightUrl": "https://url.to.img/...",
        "entranceUrl": "https://url.to.img/..."
      }
    }
    ```

### Edit Turf Settings
*   **URL:** `PATCH /api/v3/owner-settings/turf/:turfId`
*   **Description:** Update turf pricing, times, and images. All fields optional.
*   **Body:**
    ```json
    {
      "name": "Kickoff Arena Updated",
      "description": "Now with better lighting",
      "weekdayDayPrice": 1100,
      "openTime": "05:00",
      "groundNightUrl": "https://new.url.image/..."
    }
    ```
*   **Response:**
    ```json
    {
      "success": true,
      "message": "Turf settings updated successfully",
      "data": {
        "id": "turf_uuid",
        "name": "Kickoff Arena Updated",
        ...
      }
    }
    ```

---

## 3. Payment & Payout Settings

*(Note: `/payment` and `/payout` point to the same underlying entity logic)*

### Get Payment Settings
*   **URL:** `GET /api/v3/owner-settings/payment` *(or `/payout`)*
*   **Description:** View configured payment/payout mechanisms.
*   **Response:**
    ```json
    {
      "success": true,
      "data": {
        "upiId": "merchant@bank",
        "bankAccount": "1234567890",
        "payoutMethod": "UPI", // "UPI" or "BANK"
        "payoutFrequency": "WEEKLY", // "MANUAL" or "WEEKLY"
        "isActive": true
      }
    }
    ```

### Update Payment Settings
*   **URL:** `PATCH /api/v3/owner-settings/payment` *(or `/payout`)*
*   **Description:** Update UPI, Bank details, Payout method, and active status.
*   **Body:**
    ```json
    {
      "upiId": "newmerchant@okbank",
      "bankAccount": "0987654321",
      "payoutMethod": "BANK",
      "payoutFrequency": "WEEKLY",
      "isActive": true
    }
    ```
*   **Response:**
    ```json
    {
      "success": true,
      "message": "Payment settings updated successfully",
      "data": {
        "id": "payment_uuid",
        "upiId": "newmerchant@okbank",
        ...
      }
    }
    ```

---

## 4. Notification Settings

### Get Notification Settings
*   **URL:** `GET /api/v3/owner-settings/notifications`
*   **Response:**
    ```json
    {
      "success": true,
      "data": {
        "bookingAlerts": true,
        "cancellationAlerts": false
      }
    }
    ```

### Update Notification Settings
*   **URL:** `PATCH /api/v3/owner-settings/notifications`
*   **Body:**
    ```json
    {
      "bookingAlerts": true,
      "cancellationAlerts": true
    }
    ```
*   **Response:**
    ```json
    {
      "success": true,
      "message": "Notification settings updated successfully",
      "data": {
        "bookingAlerts": true,
        "cancellationAlerts": true
      }
    }
    ```

---

## 5. Cancellation Policy

### Get Cancellation Policy
*   **URL:** `GET /api/v3/owner-settings/cancellation-policy/:turfId`
*   **Description:** Dynamic policy applied directly inside the robust booking-system cancel flow.
*   **Response:**
    ```json
    {
      "success": true,
      "data": {
        "allowedBeforeHours": 2,
        "refundPercentage": 75.0
      }
    }
    ```

### Update Cancellation Policy
*   **URL:** `PATCH /api/v3/owner-settings/cancellation-policy/:turfId`
*   **Body:**
    ```json
    {
      "allowedBeforeHours": 4, // e.g. Customer can't cancel within 4 hrs
      "refundPercentage": 50 // e.g. Refund 50% if cancelled correctly
    }
    ```
*   **Response:**
    ```json
    {
      "success": true,
      "message": "Cancellation policy updated successfully",
      "data": {
        "allowedBeforeHours": 4,
        "refundPercentage": 50
      }
    }
    ```

---

## 6. Security

### Change Password / Security Detail
*   **URL:** `POST /api/v3/owner-settings/change-password`
*   **Description:** Turfsy primarily uses mobile OTP authentication. 
*   **Response:**
    ```json
    {
      "success": true,
      "message": "Turfsy uses secure phone-based authentication. Use \"Request Phone Change\" to update your secure login method."
    }
    ```

---

## 7. Support

### Get Support Info
*   **URL:** `GET /api/v3/owner-settings/support`
*   **Response:**
    ```json
    {
      "success": true,
      "data": {
        "email": "support@turfsy.com",
        "phone": "+91 9999999999",
        "whatsapp": "+91 9999999999",
        "helpCenterUrl": "https://help.turfsy.com"
      }
    }
    ```

---

## 8. Logout

### Logout Account
*   **URL:** `POST /api/v3/owner-settings/logout`
*   **Description:** Safe session revocation method.
*   **Response:**
    ```json
    {
      "success": true,
      "message": "Logged out successfully"
    }
    ```
