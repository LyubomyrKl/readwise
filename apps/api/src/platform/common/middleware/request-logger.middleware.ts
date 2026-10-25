import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { rootLogger } from '@platform/common/logger/pino';

interface RequestWithUser extends Request {
  user?: { id?: string; userId?: string };
}

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = rootLogger().child({ context: 'HTTP' });

  use(req: RequestWithUser, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const { method, originalUrl, ip } = req;

    // Honour an id set by the proxy in front of us, otherwise mint one.
    const incoming = req.headers['x-request-id'];
    const requestId =
      (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;
      const logData = {
        requestId,
        method,
        url: originalUrl,
        statusCode,
        durationMs: duration,
        ip,
        userId: req.user?.id || req.user?.userId,
      };
      const line = `${method} ${originalUrl} ${statusCode} ${duration}ms`;
      if (statusCode >= 500) {
        this.logger.error(logData, line);
      } else if (statusCode >= 400) {
        this.logger.warn(logData, line);
      } else {
        this.logger.info(logData, line);
      }
    });

    next();
  }
}
