import pino, { Logger } from 'pino';

/** One pino configuration for everything the API logs (Nest, HTTP, jobs). */
export function createPinoLogger(): Logger {
  return pino({
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

let root: Logger | undefined;

/** Process-wide root logger; children carry context, requestId, jobId. */
export function rootLogger(): Logger {
  root ??= createPinoLogger();
  return root;
}
