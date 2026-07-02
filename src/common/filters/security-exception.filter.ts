import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import * as Sentry from '@sentry/nestjs';

/**
 * Layer 11 — Generic error messages to client.
 * Full errors logged server-side only.
 */
const GENERIC_MESSAGES: Record<number, string> = {
  400: 'Invalid request.',
  401: 'Authentication required.',
  403: 'Access denied.',
  404: 'Booking not found.',
  409: 'Conflict. Please retry.',
  423: 'Resource locked.',
  429: 'Too many requests. Try later.',
  500: 'Something went wrong.',
};

@Catch()
export class SecurityExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SecurityExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let originalMessage = 'Internal server error';
    let retryAfter: number | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        originalMessage = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        originalMessage =
          (exceptionResponse as any).message ||
          (exceptionResponse as any).error ||
          'Unknown error';
        retryAfter = (exceptionResponse as any).retryAfter;
      }
    }

    const isHttpException = exception instanceof HttpException;
    const isExpected4xx = isHttpException && status >= 400 && status < 500;

    if (!isExpected4xx) {
      Sentry.withScope((scope) => {
        scope.setTag('requestId', request.id || request.headers['x-request-id'] || 'unknown');
        scope.setTag('method', request.method);
        scope.setTag('url', request.url);

        scope.setContext('request_details', {
          method: request.method,
          url: request.url,
          ip: request.ip || request.headers['x-forwarded-for'] || 'unknown',
          requestId: request.id || request.headers['x-request-id'] || 'unknown',
        });

        if (request.user?.authId) {
          scope.setUser({ id: request.user.authId });
        } else if (request.user?.id) {
          scope.setUser({ id: request.user.id });
        }

        Sentry.captureException(exception);
      });
    }

    // Server-side logging — full details
    if (status >= 500) {
      this.logger.error(`[ERROR ${status}]`, {
        path: request.url,
        method: request.method,
        message: originalMessage,
        stack: exception?.stack,
        ip: request.ip,
        requestId: request.id || request.headers['x-request-id'],
      });
    } else if (status === 400) {
      this.logger.warn(`[VALIDATION ERROR]`, {
        path: request.url,
        method: request.method,
        message: originalMessage,
        ip: request.ip,
        requestId: request.id || request.headers['x-request-id'],
      });
    } else if (status === 401 || status === 403) {
      this.logger.warn(`[AUTH ${status}]`, {
        path: request.url,
        method: request.method,
        message: originalMessage,
        ip: request.ip,
        userId: request.user?.authId || 'anonymous',
        requestId: request.id || request.headers['x-request-id'],
      });
    } else {
      this.logger.debug(`[EXCEPTION ${status}]`, {
        path: request.url,
        method: request.method,
        message: originalMessage,
        requestId: request.id || request.headers['x-request-id'],
      });
    }

    // Client-side response — generic message only
    // For 4xx: keep original message for dev-friendly responses (remove in prod if desired)
    // For 5xx: always generic
    const clientMessage = originalMessage;

    const responseBody: Record<string, any> = {
      success: false,
      statusCode: status,
      message: Array.isArray(clientMessage) ? clientMessage : clientMessage,
    };

    if (retryAfter) {
      response.setHeader('Retry-After', String(retryAfter));
      responseBody.retryAfter = retryAfter;
    }

    response.status(status).json(responseBody);
  }
}
