# Turfsy API - User Gamification Module

**Base URL Context:** `{{BASE_URL}}/api/v3/user-gamification`

All endpoints are protected and require a valid `Bearer Token` belonging to a `USER` role.

---

## 1. Overall Gamification Stats

### Get Dashboard Overall Stats
*   **URL:** `GET /api/v3/user-gamification/overall`
*   **Description:** Get your personal streak, total points, leaderboard top 10, current user rank, and nudge message.
*   **Response:**
    ```json
    {
      "streak": 5,
      "points": 450,
      "leaderboard": {
        "top10": [
          { "name": "Akash Gupta", "points": 1200 },
          { "name": "Rajiv Sharma", "points": 1150 },
          ...
        ],
        "currentUser": {
          "rank": 24,
          "name": "You",
          "points": 450
        }
      },
      "nudge": "Play today to keep your streak 🔥"
    }
    ```

---

## 2. Personal Stats

### Get Current Streak
*   **URL:** `GET /api/v3/user-gamification/streak`
*   **Description:** Fetch your latest active streak.
*   **Response:**
    ```json
    {
      "streak": 8
    }
    ```

### Get Nudge Message
*   **URL:** `GET /api/v3/user-gamification/nudge`
*   **Description:** Dynamic personalized message based on your play history or leaderboard status.
*   **Response:**
    ```json
    {
      "message": "You are close to the Top 3! Keep going! 🏆"
    }
    ```

---

## 3. Leaderboard System

### Main Leaderboard (Generic)
*   **URL:** `GET /api/v3/user-gamification/leaderboard?sortBy=points`
*   **Parameters:** `sortBy` (optional) - `points`, `totalMatches`, or `totalHours`. Defaults to `points`.
*   **Response:**
    ```json
    [
      { "name": "User 1", "points": 1500 },
      { "name": "User 2", "points": 1420 }
    ]
    ```

### Leaderboard by Points (Explicit)
*   **URL:** `GET /api/v3/user-gamification/leaderboard/points`
*   **Response:** Same as generic leaderboard sorted by points.

### Leaderboard by Matches Played
*   **URL:** `GET /api/v3/user-gamification/leaderboard/total-matches-played`
*   **Response:**
    ```json
    [
      { "name": "Akshay", "totalMatches": 45, "points": 900 },
      { "name": "Rahul", "totalMatches": 42, "points": 840 }
    ]
    ```

### Leaderboard by Hours Played
*   **URL:** `GET /api/v3/user-gamification/leaderboard/total-hours-played`
*   **Response:**
    ```json
    [
      { "name": "Sameer", "totalHours": 120.5, "points": 1200 },
      { "name": "Vijay", "totalHours": 115, "points": 1150 }
    ]
    ```

---

## 🚀 4. System Logic Details

### Streak Calculation:
*   Streak increases by **+1** when a booking is completed.
*   Only **one** increment per day (multiple slots in one day count as a single active day).
*   **5-Day Grace Rule:** 
    *   Played within 1-5 days since last session? → Streak increases.
    *   Not played for more than 5 days? → Decreases streak by 1 (floor is 0) and reduces points by 5 points progressively (applied every 5 days of inactivity).

### Points Rules:
*   Points awarded *only* for **COMPLETED** status bookings.
*   A flat **10 Points** is awarded per booking completion.
*   If a user cancels a CONFIRMED or PENDING booking, **2 Points** are deducted.

### Nudge Logic Priority:
1.  **New User (No stats)**: "Book your first game to start your streak! 🔥"
2.  **Not Played Today**: "Play today to keep your streak 🔥"
3.  **Rank 11+**: "Play more to reach Top 10!"
4.  **Rank 4-10**: "You are close to the Top 3! Keep going! 🏆"
5.  **Top 3**: "Great job! You are among the top players! 🌟"
