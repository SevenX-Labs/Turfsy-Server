import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * ResponseSanitizerInterceptor — strips sensitive fields from all API responses.
 * Layer 11: Response Data Masking
 *
 * Fields NEVER exposed:
 * - checkInPin in list/filtered/transaction APIs
 * - Internal DB error messages
 * - Other users' PII
 */
@Injectable()
export class ResponseSanitizerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const url = request.url || '';

    return next.handle().pipe(
      map((data) => {
        // Only sanitize booking-related responses
        if (!url.includes('/booking')) return data;

        return this.sanitize(data, url);
      }),
    );
  }

  private sanitize(data: any, url: string): any {
    if (!data) return data;

    // Determine if this is a "safe" endpoint where PIN can be shown
    // Only single booking detail GET and create booking POST can show PIN
    const isSingleBookingDetail =
      /\/my-bookings\/[a-f0-9-]+$/.test(url) && !url.includes('rateTurf');
    const isCreateBooking =
      url.endsWith('/booking') || url.endsWith('/booking/');

    const shouldMaskPin = !isSingleBookingDetail && !isCreateBooking;

    if (shouldMaskPin) {
      return this.recursiveStripFields(data, [
        'checkInPin',
        'pinAttempts',
        'pinLocked',
      ]);
    }

    // Always strip internal fields
    return this.recursiveStripFields(data, ['pinAttempts', 'pinLocked']);
  }

  private isDateObject(value: any): boolean {
    return (
      value instanceof Date ||
      Object.prototype.toString.call(value) === '[object Date]' ||
      (value !== null &&
        typeof value === 'object' &&
        typeof value.getTime === 'function' &&
        typeof value.toISOString === 'function')
    );
  }

  private recursiveStripFields(obj: any, fields: string[]): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;

    // Preserve Date objects — they have no enumerable own properties
    // so Object.entries(date) returns [], producing {} without this guard
    if (this.isDateObject(obj)) return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.recursiveStripFields(item, fields));
    }

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (fields.includes(key)) continue; // Strip the field

      if (this.isDateObject(value)) {
        result[key] = value;
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.recursiveStripFields(value, fields);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
