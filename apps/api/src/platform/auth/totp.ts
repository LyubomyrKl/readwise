import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Time-based one-time passwords (RFC 6238, the authenticator-app second factor):
 * HMAC-SHA1, 6 digits, 30-second steps. No dependency; the RFC test vectors are
 * in totp.spec.ts.
 */

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret: 20 bytes (160 bits, the RFC 4226 recommendation), base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function timeStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** The code of one time step (HOTP over the step counter). */
export function totpCode(secret: Buffer | string, step: number, digits = TOTP_DIGITS): string {
  const key = typeof secret === 'string' ? base32Decode(secret) : secret;
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * The step a code belongs to, accepting one step of clock drift either way, or
 * null. Steps at or before `lastStep` are refused so a code works only once.
 */
export function verifyTotp(
  secret: string,
  code: string,
  nowMs: number,
  lastStep: number | null = null,
  window = 1,
): number | null {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  const current = timeStep(nowMs);
  for (let delta = -window; delta <= window; delta++) {
    const step = current + delta;
    if (lastStep !== null && step <= lastStep) continue;
    const expected = Buffer.from(totpCode(secret, step));
    if (timingSafeEqual(expected, Buffer.from(normalized))) return step;
  }
  return null;
}

/** The otpauth:// URI authenticator apps scan (as a QR code) or open (as a link). */
export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
