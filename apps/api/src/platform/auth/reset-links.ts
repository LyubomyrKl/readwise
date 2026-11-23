import { createHash, randomBytes } from 'crypto';
import type { PrismaClient } from '@prisma/client';

/** How long a link to set a new password works. */
export const RESET_MINUTES = 30;

/** The SHA-256 a link's token is kept as: a 256-bit random token needs no slow hash. */
export const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Where the app is opened (links point there): APP_URL, else the passkeys' origin, which is the same address. */
export function appOrigin(): string {
  return (process.env.APP_URL || process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000').trim().replace(/\/+$/, '');
}

/**
 * A one-time link to set a new password for this user: it works once and for RESET_MINUTES, and
 * replaces the ones not used yet. Only its hash is stored; the token lives in the link alone.
 * Plain imports on purpose: the reset-password command loads this outside the Nest app.
 */
export async function createResetLink(
  db: Pick<PrismaClient, 'passwordReset' | '$transaction'>,
  userId: string,
): Promise<{ link: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + RESET_MINUTES * 60_000);
  await db.$transaction([
    db.passwordReset.deleteMany({ where: { userId, usedAt: null } }),
    db.passwordReset.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } }),
  ]);
  return { link: `${appOrigin()}/auth/reset-password?token=${token}`, expiresAt };
}
