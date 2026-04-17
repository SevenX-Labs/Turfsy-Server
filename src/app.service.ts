import { Injectable } from '@nestjs/common';

type HealthRoute = {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  message: string;
};

type HealthGroup = {
  module: string;
  basePath: string;
  status: 'working';
  routes: HealthRoute[];
};

type LiveEndpoint = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
};

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getLiveEndpoints(expressApp: any): LiveEndpoint[] {
    const stack = expressApp?._router?.stack;
    if (!Array.isArray(stack)) {
      return [];
    }

    const allowedMethods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    const endpointMap = new Map<string, LiveEndpoint>();

    for (const layer of stack) {
      const route = layer?.route;
      if (!route || !route.path || !route.methods) continue;

      const paths = Array.isArray(route.path) ? route.path : [route.path];
      const methods = Object.keys(route.methods)
        .filter((method) => route.methods[method])
        .map((method) => method.toUpperCase())
        .filter((method) => allowedMethods.has(method));

      for (const rawPath of paths) {
        const normalizedPath = this.normalizeRoutePath(String(rawPath));
        for (const method of methods) {
          const key = `${method} ${normalizedPath}`;
          endpointMap.set(key, {
            method: method as LiveEndpoint['method'],
            path: normalizedPath,
          });
        }
      }
    }

    return Array.from(endpointMap.values()).sort((a, b) => {
      if (a.path === b.path) return a.method.localeCompare(b.method);
      return a.path.localeCompare(b.path);
    });
  }

  private normalizeRoutePath(path: string): string {
    if (!path || path === '/') return '/';
    const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
    const withoutDuplicateSlashes = withLeadingSlash.replace(/\/{2,}/g, '/');
    return withoutDuplicateSlashes.length > 1
      ? withoutDuplicateSlashes.replace(/\/$/, '')
      : withoutDuplicateSlashes;
  }

  getEndpointHealthCatalog(): HealthGroup[] {
    return [
      {
        module: 'Auth',
        basePath: '/api/v3/auth',
        status: 'working',
        routes: [
          {
            method: 'POST',
            path: '/user/login',
            message: 'User login endpoint working',
          },
          {
            method: 'POST',
            path: '/owner/login',
            message: 'Owner login endpoint working',
          },
          {
            method: 'POST',
            path: '/user/verify-otp',
            message: 'User OTP verification endpoint working',
          },
          {
            method: 'POST',
            path: '/owner/verify-otp',
            message: 'Owner OTP verification endpoint working',
          },
          {
            method: 'POST',
            path: '/user/resend-otp',
            message: 'User OTP resend endpoint working',
          },
          {
            method: 'POST',
            path: '/owner/resend-otp',
            message: 'Owner OTP resend endpoint working',
          },
          {
            method: 'GET',
            path: '/logout',
            message: 'Logout endpoint working',
          },
          {
            method: 'DELETE',
            path: '/delete-account',
            message: 'Delete account endpoint working',
          },
          {
            method: 'GET',
            path: '/get-me',
            message: 'Get-me endpoint working',
          },
          {
            method: 'POST',
            path: '/request-phone-change',
            message: 'Phone change request endpoint working',
          },
          {
            method: 'POST',
            path: '/verify-phone-change',
            message: 'Phone change verify endpoint working',
          },
        ],
      },
      {
        module: 'User Profile',
        basePath: '/api/v3/user-profile',
        status: 'working',
        routes: [
          {
            method: 'POST',
            path: '/',
            message: 'Create user profile endpoint working',
          },
          {
            method: 'GET',
            path: '/',
            message: 'Get user profile endpoint working',
          },
          {
            method: 'PATCH',
            path: '/',
            message: 'Update user profile endpoint working',
          },
          {
            method: 'POST',
            path: '/payment-details',
            message: 'User payment details endpoint working',
          },
          {
            method: 'POST',
            path: '/location',
            message: 'User location update endpoint working',
          },
          {
            method: 'POST',
            path: '/upload-avatar',
            message: 'User avatar upload endpoint working',
          },
          {
            method: 'DELETE',
            path: '/upload-avatar',
            message: 'User avatar delete endpoint working',
          },
        ],
      },
      {
        module: 'Owner Profile',
        basePath: '/api/v3/ownerProfile',
        status: 'working',
        routes: [
          {
            method: 'POST',
            path: '/',
            message: 'Create owner profile endpoint working',
          },
          {
            method: 'GET',
            path: '/',
            message: 'Get owner profile endpoint working',
          },
          {
            method: 'PATCH',
            path: '/',
            message: 'Update owner profile endpoint working',
          },
          {
            method: 'POST',
            path: '/payment-details',
            message: 'Owner payment details endpoint working',
          },
        ],
      },
      {
        module: 'Turfs',
        basePath: '/api/v3/turfs',
        status: 'working',
        routes: [
          {
            method: 'POST',
            path: '/',
            message: 'Create turf endpoint working',
          },
          { method: 'GET', path: '/', message: 'List turf endpoint working' },
          {
            method: 'GET',
            path: '/nearby',
            message: 'Nearby turf endpoint working',
          },
          {
            method: 'GET',
            path: '/my',
            message: 'Owner turf list endpoint working',
          },
          {
            method: 'GET',
            path: '/search',
            message: 'Search turf endpoint working',
          },
          {
            method: 'GET',
            path: '/filter',
            message: 'Filter turf endpoint working',
          },
          {
            method: 'PATCH',
            path: '/:turfId',
            message: 'Update turf endpoint working',
          },
          {
            method: 'PATCH',
            path: '/:turfId/status',
            message: 'Turf status endpoint working',
          },
          {
            method: 'GET',
            path: '/:turfId',
            message: 'Get turf details endpoint working',
          },
          {
            method: 'POST',
            path: '/:turfId/images',
            message: 'Turf image upload endpoint working',
          },
          {
            method: 'PATCH',
            path: '/:turfId/upload-image/:type',
            message: 'Turf image update endpoint working',
          },
        ],
      },
      {
        module: 'User Home',
        basePath: '/api/v3/user-home',
        status: 'working',
        routes: [
          { method: 'GET', path: '/', message: 'User home endpoint working' },
          {
            method: 'GET',
            path: '/top-recommended',
            message: 'Top recommended endpoint working',
          },
          {
            method: 'GET',
            path: '/most-rated',
            message: 'Most rated endpoint working',
          },
          {
            method: 'GET',
            path: '/budget-friendly',
            message: 'Budget-friendly endpoint working',
          },
          {
            method: 'GET',
            path: '/nearby',
            message: 'Nearby feed endpoint working',
          },
          {
            method: 'GET',
            path: '/most-demanded',
            message: 'Most demanded endpoint working',
          },
          {
            method: 'GET',
            path: '/newly-opened',
            message: 'Newly opened endpoint working',
          },
          {
            method: 'GET',
            path: '/recently-viewed',
            message: 'Recently viewed endpoint working',
          },
        ],
      },
      {
        module: 'Saved Turfs',
        basePath: '/api/v3/saved-turfs',
        status: 'working',
        routes: [
          {
            method: 'POST',
            path: '/:turfId',
            message: 'Save turf endpoint working',
          },
          {
            method: 'DELETE',
            path: '/:turfId',
            message: 'Unsave turf endpoint working',
          },
          {
            method: 'GET',
            path: '/',
            message: 'Saved turf list endpoint working',
          },
        ],
      },
      {
        module: 'Booking',
        basePath: '/api/v3/booking',
        status: 'working',
        routes: [
          {
            method: 'POST',
            path: '/',
            message: 'Create booking endpoint working',
          },
          {
            method: 'POST',
            path: '/:bookingId/rebook',
            message: 'Rebook endpoint working',
          },
          {
            method: 'POST',
            path: '/:bookingId/create-order',
            message: 'Create order endpoint working',
          },
          {
            method: 'POST',
            path: '/:bookingId/confirm-payment',
            message: 'Confirm payment endpoint working',
          },
          {
            method: 'POST',
            path: '/razorpay/webhook',
            message: 'Razorpay webhook endpoint working',
          },
          {
            method: 'POST',
            path: '/:bookingId/payment-failed',
            message: 'Payment failed endpoint working',
          },
          {
            method: 'POST',
            path: '/:bookingId/verify-pin',
            message: 'Verify pin endpoint working',
          },
          {
            method: 'PATCH',
            path: '/:bookingId/complete',
            message: 'Complete booking endpoint working',
          },
          {
            method: 'GET',
            path: '/owner/bookings',
            message: 'Owner bookings endpoint working',
          },
          {
            method: 'GET',
            path: '/owner/bookings-filtered',
            message: 'Owner filtered bookings endpoint working',
          },
          {
            method: 'GET',
            path: '/owner/bookings/:bookingId',
            message: 'Owner booking details endpoint working',
          },
          {
            method: 'GET',
            path: '/owner/bookings/active',
            message: 'Owner active bookings endpoint working',
          },
          {
            method: 'GET',
            path: '/owner/analytics',
            message: 'Owner analytics endpoint working',
          },
          {
            method: 'GET',
            path: '/owner/analytics/csv',
            message: 'Owner analytics CSV endpoint working',
          },
          {
            method: 'GET',
            path: '/owner/analytics/pdf',
            message: 'Owner analytics PDF endpoint working',
          },
          {
            method: 'PATCH',
            path: '/:bookingId/cancel',
            message: 'Cancel booking endpoint working',
          },
          {
            method: 'POST',
            path: '/cron/no-shows',
            message: 'No-show cron endpoint working',
          },
          {
            method: 'POST',
            path: '/cron/auto-complete',
            message: 'Auto-complete cron endpoint working',
          },
          {
            method: 'POST',
            path: '/my-bookings/:bookingId/rateTurf',
            message: 'Rate turf endpoint working',
          },
          {
            method: 'GET',
            path: '/my-bookings/active',
            message: 'My active booking endpoint working',
          },
          {
            method: 'GET',
            path: '/my-bookings',
            message: 'My bookings endpoint working',
          },
          {
            method: 'GET',
            path: '/my-bookings/bookings',
            message: 'My bookings filtered endpoint working',
          },
          {
            method: 'GET',
            path: '/transaction-history',
            message: 'Transaction history endpoint working',
          },
          {
            method: 'GET',
            path: '/my-bookings/:bookingId/invoice',
            message: 'Invoice endpoint working',
          },
          {
            method: 'GET',
            path: '/my-bookings/:bookingId/invoice/pdf',
            message: 'Invoice PDF endpoint working',
          },
          {
            method: 'GET',
            path: '/my-bookings/:bookingId',
            message: 'Booking detail endpoint working',
          },
          {
            method: 'GET',
            path: '/availability/:turfId',
            message: 'Booking availability endpoint working',
          },
          {
            method: 'POST',
            path: '/pay-at-turf',
            message: 'Pay at turf endpoint working',
          },
        ],
      },
      {
        module: 'User Settings',
        basePath: '/api/v3/user-settings',
        status: 'working',
        routes: [
          {
            method: 'GET',
            path: '/payment',
            message: 'User payment settings endpoint working',
          },
          {
            method: 'PATCH',
            path: '/payment',
            message: 'User payment settings update endpoint working',
          },
          {
            method: 'POST',
            path: '/change-password',
            message: 'User change-password endpoint working',
          },
          {
            method: 'POST',
            path: '/change-phone',
            message: 'User change-phone endpoint working',
          },
          {
            method: 'GET',
            path: '/preferences',
            message: 'User preferences endpoint working',
          },
          {
            method: 'PATCH',
            path: '/preferences',
            message: 'User preferences update endpoint working',
          },
          {
            method: 'GET',
            path: '/notifications',
            message: 'User notifications endpoint working',
          },
          {
            method: 'PATCH',
            path: '/notifications',
            message: 'User notifications update endpoint working',
          },
        ],
      },
      {
        module: 'Owner Settings',
        basePath: '/api/v3/owner-settings',
        status: 'working',
        routes: [
          {
            method: 'GET',
            path: '/profile',
            message: 'Owner profile settings endpoint working',
          },
          {
            method: 'PATCH',
            path: '/profile',
            message: 'Owner profile settings update endpoint working',
          },
          {
            method: 'GET',
            path: '/turf/:turfId',
            message: 'Owner turf settings endpoint working',
          },
          {
            method: 'PATCH',
            path: '/turf/:turfId',
            message: 'Owner turf settings update endpoint working',
          },
          {
            method: 'GET',
            path: '/payment',
            message:
              'Owner payment settings endpoint working (owner-settings model)',
          },
          {
            method: 'PATCH',
            path: '/payment',
            message:
              'Owner payment settings update endpoint working (owner-settings model)',
          },
          {
            method: 'GET',
            path: '/payout',
            message:
              'Owner payout settings endpoint working (owner-settings model)',
          },
          {
            method: 'PATCH',
            path: '/payout',
            message:
              'Owner payout settings update endpoint working (owner-settings model)',
          },
          {
            method: 'GET',
            path: '/notifications',
            message: 'Owner notification settings endpoint working',
          },
          {
            method: 'PATCH',
            path: '/notifications',
            message: 'Owner notification settings update endpoint working',
          },
          {
            method: 'GET',
            path: '/cancellation-policy/:turfId',
            message: 'Owner cancellation policy endpoint working',
          },
          {
            method: 'PATCH',
            path: '/cancellation-policy/:turfId',
            message: 'Owner cancellation policy update endpoint working',
          },
          {
            method: 'POST',
            path: '/change-password',
            message: 'Owner change password endpoint working',
          },
          {
            method: 'GET',
            path: '/support',
            message: 'Owner support endpoint working',
          },
          {
            method: 'POST',
            path: '/logout',
            message: 'Owner logout endpoint working',
          },
        ],
      },
      {
        module: 'Owner Analytics',
        basePath: '/owner-analytics',
        status: 'working',
        routes: [
          {
            method: 'GET',
            path: '/overall',
            message: 'Owner analytics overview endpoint working',
          },
          {
            method: 'GET',
            path: '/total-revenue',
            message: 'Owner total revenue endpoint working',
          },
          {
            method: 'GET',
            path: '/total-bookings',
            message: 'Owner total bookings endpoint working',
          },
          {
            method: 'GET',
            path: '/completed-bookings',
            message: 'Owner completed bookings endpoint working',
          },
          {
            method: 'GET',
            path: '/cancelled-bookings',
            message: 'Owner cancelled bookings endpoint working',
          },
          {
            method: 'GET',
            path: '/revenue-by-date',
            message: 'Owner revenue-by-date endpoint working',
          },
          {
            method: 'GET',
            path: '/bookings-by-date',
            message: 'Owner bookings-by-date endpoint working',
          },
          {
            method: 'GET',
            path: '/cash-vs-online',
            message: 'Owner cash-vs-online endpoint working',
          },
          {
            method: 'GET',
            path: '/peak-hours',
            message: 'Owner peak-hours endpoint working',
          },
          {
            method: 'GET',
            path: '/cancellation-rate',
            message: 'Owner cancellation-rate endpoint working',
          },
          {
            method: 'GET',
            path: '/no-show-rate',
            message: 'Owner no-show-rate endpoint working',
          },
        ],
      },
      {
        module: 'Owner Home',
        basePath: '/owner-home',
        status: 'working',
        routes: [
          {
            method: 'GET',
            path: '/dashboard',
            message: 'Owner dashboard endpoint working',
          },
          {
            method: 'GET',
            path: '/revenue-summary',
            message: 'Owner revenue summary endpoint working',
          },
          {
            method: 'GET',
            path: '/booking-statistics',
            message: 'Owner booking statistics endpoint working',
          },
          {
            method: 'GET',
            path: '/recent-activity',
            message: 'Owner recent activity endpoint working',
          },
          {
            method: 'GET',
            path: '/trends',
            message: 'Owner trends endpoint working',
          },
          {
            method: 'GET',
            path: '/payment-distribution',
            message: 'Owner payment distribution endpoint working',
          },
          {
            method: 'GET',
            path: '/turf-performance',
            message: 'Owner turf performance endpoint working',
          },
        ],
      },
      {
        module: 'User Gamification',
        basePath: '/api/v3/user-gamification',
        status: 'working',
        routes: [
          {
            method: 'GET',
            path: '/overall',
            message: 'Gamification overall endpoint working',
          },
          {
            method: 'GET',
            path: '/streak',
            message: 'Gamification streak endpoint working',
          },
          {
            method: 'GET',
            path: '/nudge',
            message: 'Gamification nudge endpoint working',
          },
          {
            method: 'GET',
            path: '/leaderboard',
            message: 'Gamification leaderboard endpoint working',
          },
          {
            method: 'GET',
            path: '/leaderboard/points',
            message: 'Gamification points leaderboard endpoint working',
          },
          {
            method: 'GET',
            path: '/leaderboard/total-matches-played',
            message: 'Gamification matches leaderboard endpoint working',
          },
          {
            method: 'GET',
            path: '/leaderboard/total-hours-played',
            message: 'Gamification hours leaderboard endpoint working',
          },
        ],
      },
      {
        module: 'System',
        basePath: '/sahil/hode',
        status: 'working',
        routes: [
          {
            method: 'GET',
            path: '/api/health',
            message: 'Custom health check endpoint working',
          },
        ],
      },
    ];
  }
}
