import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';

interface RequestWithUser extends Request {
  user?: { id?: string; userId?: string };
}

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithUser>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Only report 5xx errors to Sentry
    if (status >= 500) {
      Sentry.captureException(exception, {
        extra: {
          url: request.url,
          method: request.method,
          userId: request.user?.id || request.user?.userId,
          body: this.sanitizeBody(request.body),
          query: request.query,
        },
        tags: {
          statusCode: status.toString(),
          path: request.path,
        },
      });
    }

    // an HTTP error keeps the body Nest gives it (clients read fields such as `code`: TOTP_REQUIRED)
    const body: Record<string, unknown> =
      exception instanceof HttpException
        ? (() => {
            const r = exception.getResponse();
            return typeof r === 'string' ? { statusCode: status, message: r } : { statusCode: status, ...(r as Record<string, unknown>) };
          })()
        : { statusCode: status, message: 'Internal server error' };

    response.status(status).json({ ...body, timestamp: new Date().toISOString(), path: request.url });
  }

  private sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
    if (!body || typeof body !== 'object') return body;

    const sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'cookie'];
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
