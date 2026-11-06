-- =====================================================================
-- Migration: Reactivate Expo Push Tokens Falsely Deactivated by Firebase Admin SDK
-- Date: 2026-11-06
-- Reason: The previous dispatchPushToUser() sent ExponentPushToken[...] to
--         Firebase Admin SDK, which rejected them as invalid. The error handler
--         then set is_active = false, killing all push delivery.
-- =====================================================================

-- 1. Reactivate all Expo push tokens that were falsely deactivated
UPDATE "fcm_devices"
SET "is_active" = true, "updated_at" = NOW()
WHERE ("fcm_token" LIKE 'ExponentPushToken[%' OR "fcm_token" LIKE 'expo.v2:%')
  AND "is_active" = false;

-- 2. Verify the result
SELECT
  COUNT(*) FILTER (WHERE "is_active" = true)  AS active_expo_tokens,
  COUNT(*) FILTER (WHERE "is_active" = false) AS inactive_expo_tokens,
  COUNT(*)                                     AS total_expo_tokens
FROM "fcm_devices"
WHERE "fcm_token" LIKE 'ExponentPushToken[%' OR "fcm_token" LIKE 'expo.v2:%';

