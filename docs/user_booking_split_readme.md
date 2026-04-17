# User Booking Splitwise Module 💸

This module calculates and manages the split payment logic out of the total Turf booking amount.

## Base URL
All split routes are mounted under:
`[/api/v3/booking]`

Authentication: **Required** (`Bearer Token` / `JwtAuthGuard`)
Rate limited: **Yes** (strict 15req/min for modifications to prevent abuse)

---

## 📱 Frontend Integration Flow 

Here is the exact step-by-step workflow for integrating the Split system into the mobile app:

### Step 1: Booking & Navigation
1. The user successfully books a turf.
2. The user navigates to the **My Bookings** screen and clicks on **"View Details"**.
3. Inside the details page, the user clicks the **"Split in Team"** button.
4. The user is navigated to the dedicated Split Page.

### Step 2: Adding Teammates
1. In the Split Page, the Lead User adds players by their usernames (e.g., 10 players).
2. The frontend fires `POST /api/v3/booking/:bookingId/split/players`.
   **Body:** `{ "usernames": ["player1", "player2", ...] }`
3. The system instantly processes this and calculates the automatic equal split in the background.

### Step 3: Previewing the Automatic Split
1. Immediately after adding players, the frontend calls `GET /api/v3/booking/:bookingId/split`.
2. The UI renders the returned data, displaying exactly how much each player theoretically owes (e.g., ₹100 per person).

### Step 4: Custom Adjustments (Optional)
1. If the Lead User wants to take on more of the cost (e.g., Lead pays ₹300, someone else pays ₹200, and the rest pay less), they edit the amounts directly in the UI text inputs.
2. The frontend ensures the total sum equals the original booking cost.
3. The frontend submits the final adjusted fractions using `PATCH /api/v3/booking/:bookingId/split/custom-amounts`.
   **Body Example:**
   ```json
   {
     "amounts": [
       { "playerId": "uuid-1", "amount": 300 },
       { "playerId": "uuid-2", "amount": 200 }
     ]
   }
   ```

### Step 5: Confirming the Split
1. The Lead User clicks **"Confirm Split"**.
2. The frontend fires `POST /api/v3/booking/:bookingId/split/trigger`.
3. The backend locks the split (`isSplitDone = true`), rendering it finalized and blocking further structural additions.
4. **Final Result**: The system officially maps who owes what to the Lead User. The other users can now view their pending debt and manually pay their exact split amount to the Lead User in real life. (Lead can mark statuses as PAID later when settling up in cash/UPI).

---

## 📡 Single Reference API Endpoint List

1. **Add Players**: `POST /:bookingId/split/players`
2. **Remove Player**: `DELETE /split/players/:playerId`
3. **Fetch Split Status (Preview & State)**: `GET /:bookingId/split`
4. **Setting Custom Amounts (Overrides)**: `PATCH /:bookingId/split/custom-amounts`
5. **Trigger/Confirm Final Split**: `POST /:bookingId/split/trigger`
6. **Settle Debt Status**: `PATCH /split/players/:playerId/status` (Changes `PENDING` to `PAID`)
