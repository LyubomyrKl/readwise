import { Injectable, LoggerService } from '@nestjs/common';
import { Logger } from 'pino';
import { rootLogger } from './pino';

type Level = 'info' | 'error' | 'warn' | 'debug' | 'trace';

/**
 * Nest LoggerService backed by pino. Installed with app.useLogger() in main.ts,
 * so `new Logger(Context)` anywhere in the code base writes JSON lines with a
 * `context` field. Nest passes the context as the last string argument and, for
 * errors, the stack trace before it.
 */
@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly logger: Logger = rootLogger();

  log(message: unknown, ...params: unknown[]) {
    this.write('info', message, params);
  }

  error(message: unknown, ...params: unknown[]) {
    this.write('error', message, params);
  }

  warn(message: unknown, ...params: unknown[]) {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]) {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]) {
    this.write('trace', message, params);
  }

  /** A pino child logger with fixed fields (requestId, jobId, toolId, ...). */
  child(bindings: Record<string, unknown>): Logger {
    return this.logger.child(bindings);
  }

  private write(level: Level, message: unknown, params: unknown[]) {
    const rest = [...params];
    const context =
      rest.length > 0 && typeof rest[rest.length - 1] === 'string'
        ? (rest.pop() as string)
        : undefined;
    const fields: Record<string, unknown> = {};
    if (context) fields.context = context;
    if (level === 'error' && rest.length > 0 && typeof rest[0] === 'string') {
      fields.trace = rest.shift();
    }
    if (rest.length > 0) fields.params = rest;

    if (message instanceof Error) {
      this.logger[level]({ ...fields, err: message }, message.message);
    } else if (typeof message === 'object' && message !== null) {
      this.logger[level]({ ...fields, ...(message as Record<string, unknown>) });
    } else {
      this.logger[level](fields, String(message));
    }
  }
}
