import { Injectable, LoggerService, Scope } from '@nestjs/common';
import pino, { Logger } from 'pino';

@Injectable({ scope: Scope.TRANSIENT })
export class PinoLoggerService implements LoggerService {
  private readonly logger: Logger;
  private context?: string;

  constructor() {
    this.logger = pino({
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
  }

  setContext(context: string) {
    this.context = context;
  }

  log(message: string, context?: string) {
    this.logger.info({ context: context || this.context }, message);
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(
      { context: context || this.context, trace },
      message,
    );
  }

  warn(message: string, context?: string) {
    this.logger.warn({ context: context || this.context }, message);
  }

  debug(message: string, context?: string) {
    this.logger.debug({ context: context || this.context }, message);
  }

  verbose(message: string, context?: string) {
    this.logger.trace({ context: context || this.context }, message);
  }

  // Extended logging methods with structured data
  logWithData(message: string, data: Record<string, unknown>, context?: string) {
    this.logger.info({ context: context || this.context, ...data }, message);
  }

  errorWithData(
    message: string,
    data: Record<string, unknown>,
    trace?: string,
    context?: string,
  ) {
    this.logger.error(
      { context: context || this.context, trace, ...data },
      message,
    );
  }

  warnWithData(message: string, data: Record<string, unknown>, context?: string) {
    this.logger.warn({ context: context || this.context, ...data }, message);
  }
}
