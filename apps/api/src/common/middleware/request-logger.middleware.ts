import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import pino from 'pino';

interface RequestWithUser extends Request {
  user?: { id?: string; userId?: string };
}

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  use(req: RequestWithUser, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const { method, originalUrl, ip } = req;

    // Generate a unique request ID
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    req.headers['x-request-id'] = requestId;

    // Log request
    this.logger.info(
      {
        context: 'HTTP',
        requestId,
        method,
        url: originalUrl,
        ip,
        userAgent: req.get('user-agent'),
      },
      `Incoming ${method} ${originalUrl}`,
    );

    // Log response on finish
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;

      const logData = {
        context: 'HTTP',
        requestId,
        method,
        url: originalUrl,
        statusCode,
        duration: `${duration}ms`,
        userId: req.user?.id || req.user?.userId,
      };

      if (statusCode >= 500) {
        this.logger.error(logData, `${method} ${originalUrl} ${statusCode} ${duration}ms`);
      } else if (statusCode >= 400) {
        this.logger.warn(logData, `${method} ${originalUrl} ${statusCode} ${duration}ms`);
      } else {
        this.logger.info(logData, `${method} ${originalUrl} ${statusCode} ${duration}ms`);
      }
    });

    next();
  }
}
