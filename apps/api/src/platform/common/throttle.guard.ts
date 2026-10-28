import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';

/**
 * Rate limiting keyed by session, not by IP. Every browser request reaches the
 * API from the web container, so an IP key would throttle all users as one.
 * Authenticated requests are keyed by a hash of their bearer token; anonymous
 * ones by the client address the proxy forwards (X-Forwarded-For) or the socket.
 */
@Injectable()
export class SessionThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(trackerOf(req));
  }
}

export function trackerOf(req: Record<string, unknown>): string {
  const headers = (req.headers ?? {}) as Record<string, string | string[] | undefined>;
  const auth = headers.authorization;
  if (typeof auth === 'string' && /^bearer\s+\S+/i.test(auth)) {
    const token = auth.replace(/^bearer\s+/i, '');
    return `session:${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
  }
  const forwarded = headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  const ip = first || (typeof req.ip === 'string' ? req.ip : undefined) || 'unknown';
  return `ip:${ip}`;
}
