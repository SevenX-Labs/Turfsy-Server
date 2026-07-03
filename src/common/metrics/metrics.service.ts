import { Injectable } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Gauge,
} from 'prom-client';

/**
 * Centralized Prometheus metrics service.
 *
 * All custom metrics are defined here and exposed via DI.
 * Thread-safe: prom-client uses atomic operations internally.
 */
@Injectable()
export class MetricsService {
  // ═══════════════════════════════════════════════════════
  // AUTH METRICS
  // ═══════════════════════════════════════════════════════

  readonly otpSentTotal = new Counter({
    name: 'otp_sent_total',
    help: 'Total OTP messages sent',
    labelNames: ['role'] as const,
  });

  readonly otpVerifiedTotal = new Counter({
    name: 'otp_verified_total',
    help: 'Total successful OTP verifications',
    labelNames: ['role'] as const,
  });

  readonly loginTotal = new Counter({
    name: 'login_total',
    help: 'Total successful user logins',
    labelNames: ['role'] as const,
  });

  readonly signupTotal = new Counter({
    name: 'signup_total',
    help: 'Total new user signups',
    labelNames: ['role'] as const,
  });

  readonly refreshTokenTotal = new Counter({
    name: 'refresh_token_total',
    help: 'Total JWT token refreshes requested',
  });

  readonly logoutTotal = new Counter({
    name: 'logout_total',
    help: 'Total logouts',
  });

  // ═══════════════════════════════════════════════════════
  // BOOKING METRICS
  // ═══════════════════════════════════════════════════════

  readonly bookingCreatedTotal = new Counter({
    name: 'booking_created_total',
    help: 'Total bookings created',
    labelNames: ['status', 'payment_type'] as const,
  });

  readonly bookingCancelledTotal = new Counter({
    name: 'booking_cancelled_total',
    help: 'Total bookings cancelled',
  });

  readonly bookingFailedTotal = new Counter({
    name: 'booking_failed_total',
    help: 'Total booking creation failures',
  });

  // ═══════════════════════════════════════════════════════
  // PAYMENT METRICS
  // ═══════════════════════════════════════════════════════

  readonly paymentInitiatedTotal = new Counter({
    name: 'payment_initiated_total',
    help: 'Total Razorpay orders created',
  });

  readonly paymentVerifiedTotal = new Counter({
    name: 'payment_verified_total',
    help: 'Total payments successfully verified',
  });

  readonly paymentFailedTotal = new Counter({
    name: 'payment_failed_total',
    help: 'Total payment verification failures',
  });

  readonly refundTotal = new Counter({
    name: 'refund_total',
    help: 'Total refunds processed',
    labelNames: ['status'] as const,
  });

  // ═══════════════════════════════════════════════════════
  // WEBHOOK METRICS
  // ═══════════════════════════════════════════════════════

  readonly webhookReceivedTotal = new Counter({
    name: 'webhook_received_total',
    help: 'Total Razorpay webhooks received',
  });

  readonly webhookFailedTotal = new Counter({
    name: 'webhook_failed_total',
    help: 'Total webhook processing failures',
  });

  // ═══════════════════════════════════════════════════════
  // ACTIVE USERS
  // ═══════════════════════════════════════════════════════

  readonly activeUsersGauge = new Gauge({
    name: 'active_users_gauge',
    help: 'Currently active authenticated sessions (approximation based on login/logout)',
  });

  // ═══════════════════════════════════════════════════════
  // CACHE METRICS (In-Memory LRU & Redis)
  // ═══════════════════════════════════════════════════════

  readonly cacheHitTotal = new Counter({
    name: 'cache_hit_total',
    help: 'Total LRU cache hits',
  });

  readonly cacheMissTotal = new Counter({
    name: 'cache_miss_total',
    help: 'Total LRU cache misses',
  });

  readonly redisCacheHitsTotal = new Counter({
    name: 'redis_cache_hits_total',
    help: 'Total Redis cache hits',
  });

  readonly redisCacheMissesTotal = new Counter({
    name: 'redis_cache_misses_total',
    help: 'Total Redis cache misses',
  });

  // ═══════════════════════════════════════════════════════
  // REDIS METRICS
  // ═══════════════════════════════════════════════════════

  readonly redisConnected = new Gauge({
    name: 'redis_connected',
    help: 'Redis connection status (1 = connected, 0 = disconnected)',
  });

  readonly redisErrorsTotal = new Counter({
    name: 'redis_errors_total',
    help: 'Total Redis errors',
  });

  readonly redisLockTotal = new Counter({
    name: 'redis_lock_total',
    help: 'Total Redis distributed lock acquisitions',
  });

  readonly redisLocksAcquiredTotal = new Counter({
    name: 'redis_locks_acquired_total',
    help: 'Total Redis locks successfully acquired',
  });

  // ═══════════════════════════════════════════════════════
  // BULLMQ METRICS
  // ═══════════════════════════════════════════════════════

  readonly bullmqJobsWaitingTotal = new Gauge({
    name: 'bullmq_jobs_waiting_total',
    help: 'Total number of BullMQ jobs in waiting state',
    labelNames: ['queue'] as const,
  });

  readonly bullmqJobCompletedTotal = new Counter({
    name: 'bullmq_job_completed_total',
    help: 'Total successfully completed BullMQ jobs',
    labelNames: ['queue'] as const,
  });

  readonly bullmqJobFailedTotal = new Counter({
    name: 'bullmq_job_failed_total',
    help: 'Total failed BullMQ jobs',
    labelNames: ['queue'] as const,
  });

  // ═══════════════════════════════════════════════════════
  // DATABASE METRICS (Prisma)
  // ═══════════════════════════════════════════════════════

  readonly prismaQueryTotal = new Counter({
    name: 'prisma_query_total',
    help: 'Total Prisma queries executed',
    labelNames: ['model', 'action'] as const,
  });

  readonly prismaQueryDuration = new Histogram({
    name: 'prisma_query_duration_seconds',
    help: 'Prisma query duration in seconds',
    labelNames: ['model', 'action'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  });

  // ═══════════════════════════════════════════════════════
  // HTTP METRICS
  // ═══════════════════════════════════════════════════════

  readonly httpRequestTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'] as const,
  });

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  });

  readonly httpStatusCodeTotal = new Counter({
    name: 'http_status_code_total',
    help: 'Total HTTP responses by status code class',
    labelNames: ['status_class'] as const,
  });
}

