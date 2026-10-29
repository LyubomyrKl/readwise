import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';

const jwt = new JwtService({});

/**
 * Rate limiting keyed by session, not by IP. Every browser request reaches the
 * API from the web container, so an IP key alone would throttle all users as
 * one. A request is keyed by its session only when its access token verifies:
 * an unverified bearer is not a session, and keying by it would give every
 * made-up token a budget of its own (unlimited password guesses). Everything
 * else is keyed by the client address the proxies forward (X-Forwarded-For,
 * set fresh by Caddy and passed on by the web app) or the socket.
 */
@Injectable()
export class SessionThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(trackerOf(req));
  }
}

/** The session id of a valid access token, or null. */
export function sessionOf(token: string): string | null {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) return null;
  try {
    const payload = jwt.verify<{ sid?: unknown }>(token, { secret });
    return typeof payload.sid === 'string' ? payload.sid : null;
  } catch {
    return null;
  }
}

export function trackerOf(req: Record<string, unknown>, verify: (token: string) => string | null = sessionOf): string {
  const headers = (req.headers ?? {}) as Record<string, string | string[] | undefined>;
  const auth = headers.authorization;
  if (typeof auth === 'string' && /^bearer\s+\S+/i.test(auth)) {
    const session = verify(auth.replace(/^bearer\s+/i, ''));
    if (session) return `session:${session}`;
  }
  const forwarded = headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  const ip = first || (typeof req.ip === 'string' ? req.ip : undefined) || 'unknown';
  return `ip:${ip}`;
}
