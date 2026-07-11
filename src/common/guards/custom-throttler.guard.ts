import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const url = request?.originalUrl || request?.url || '';
    const className = context.getClass()?.name || '';

    // Skip rate limiting if the request is for any admin API or uses an Admin controller
    if (
      url.startsWith('/api/v1/admin') ||
      url.includes('/admin/') ||
      className.startsWith('Admin')
    ) {
      return true;
    }

    return super.shouldSkip(context);
  }
}
