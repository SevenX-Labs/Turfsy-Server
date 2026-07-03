/**
 * Redis injection tokens and TTL constants.
 */

// DI token for the raw Redis client
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

// ═══════════════════════════════════════════════════════
// Cache TTL constants (in milliseconds)
// ═══════════════════════════════════════════════════════

export const CACHE_TTL = {
  /** Turf list / detail pages — 5 minutes */
  TURF_LIST: 1000 * 60 * 5,
  TURF_DETAIL: 1000 * 60 * 5,

  /** Home page sections — 5 minutes */
  HOME_SECTIONS: 1000 * 60 * 5,

  /** User / Owner profiles — 2 minutes */
  PROFILE: 1000 * 60 * 2,

  /** Auth getMe — 2 minutes */
  AUTH_SESSION: 1000 * 60 * 2,

  /** Analytics data — 60 seconds */
  ANALYTICS: 1000 * 60,

  /** Splitwise data — 2 minutes */
  SPLITWISE: 1000 * 60 * 2,

  /** Default fallback — 5 minutes */
  DEFAULT: 1000 * 60 * 5,
} as const;

// ═══════════════════════════════════════════════════════
// Distributed Lock TTL constants (in milliseconds)
// ═══════════════════════════════════════════════════════

export const LOCK_TTL = {
  /** Booking slot lock — 30 seconds */
  BOOKING_SLOT: 30_000,

  /** Payment order creation — 15 seconds */
  PAYMENT_ORDER: 15_000,

  /** Payment confirmation — 15 seconds */
  PAYMENT_CONFIRM: 15_000,

  /** Pay at turf — 15 seconds */
  PAYMENT_CASH: 15_000,
} as const;

// ═══════════════════════════════════════════════════════
// Idempotency TTL constants (in milliseconds)
// ═══════════════════════════════════════════════════════

export const IDEMPOTENCY_TTL = {
  /** Create order — 5 minutes */
  CREATE_ORDER: 1000 * 60 * 5,

  /** Confirm payment — 5 minutes */
  CONFIRM_PAYMENT: 1000 * 60 * 5,
} as const;

// ═══════════════════════════════════════════════════════
// OTP Rate Limit TTL (in milliseconds)
// ═══════════════════════════════════════════════════════

export const OTP_RATE_LIMIT_TTL = 1000 * 60 * 60; // 1 hour window
export const OTP_RATE_LIMIT_MAX = 5; // max 5 OTP requests per phone per hour
