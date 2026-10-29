import { BadRequestException, UnauthorizedException, type ArgumentsHost } from '@nestjs/common';
import { SentryExceptionFilter } from './sentry-exception.filter';

jest.mock('@sentry/node', () => ({ captureException: jest.fn() }));

function run(exception: unknown) {
  let status = 0;
  let body: Record<string, unknown> = {};
  const response = {
    status(code: number) {
      status = code;
      return this;
    },
    json(value: Record<string, unknown>) {
      body = value;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ url: '/api/auth/login', path: '/api/auth/login', method: 'POST', body: {} }) }),
  } as unknown as ArgumentsHost;
  new SentryExceptionFilter().catch(exception, host);
  return { status, body };
}

describe('SentryExceptionFilter', () => {
  it('keeps the body of an HTTP error, codes included, and adds where and when', () => {
    const { status, body } = run(new UnauthorizedException({ statusCode: 401, error: 'Unauthorized', code: 'TOTP_REQUIRED', message: 'Enter the code from your authenticator app' }));
    expect(status).toBe(401);
    expect(body).toMatchObject({ statusCode: 401, code: 'TOTP_REQUIRED', message: 'Enter the code from your authenticator app', path: '/api/auth/login' });
    expect(typeof body.timestamp).toBe('string');
    expect(run(new BadRequestException(['name must be a string'])).body).toMatchObject({ statusCode: 400, message: ['name must be a string'] });
  });

  it('hides what went wrong in anything else', () => {
    const { status, body } = run(new Error('connection string with a password in it'));
    expect(status).toBe(500);
    expect(body).toMatchObject({ statusCode: 500, message: 'Internal server error' });
    expect(JSON.stringify(body)).not.toContain('password');
  });
});
