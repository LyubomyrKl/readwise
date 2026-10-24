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

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    response.status(status).json({
      statusCode: status,
      message: typeof message === 'string' ? message : (message as Record<string, unknown>).message || message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
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
