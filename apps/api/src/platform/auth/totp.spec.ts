import { base32Decode, base32Encode, generateTotpSecret, otpauthUri, totpCode, verifyTotp } from './totp';

// RFC 6238 appendix B, SHA1, secret "12345678901234567890"; the RFC prints 8 digits.
const RFC_SECRET = Buffer.from('12345678901234567890');

describe('totp', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('matches the RFC 6238 vector at T=%i', (seconds, expected) => {
    expect(totpCode(RFC_SECRET, Math.floor(seconds / 30), 8)).toBe(expected);
    expect(totpCode(RFC_SECRET, Math.floor(seconds / 30))).toBe(expected.slice(2));
  });

  it('round-trips base32', () => {
    const bytes = Buffer.from('12345678901234567890');
    expect(base32Encode(bytes)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq')).toEqual(bytes);
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('accepts the current code and one step of drift, once', () => {
    const secret = base32Encode(RFC_SECRET);
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totpCode(secret, step), now)).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(secret, totpCode(secret, step - 2), now)).toBeNull();
    // replay: the step already used is refused
    expect(verifyTotp(secret, totpCode(secret, step), now, step)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
    expect(verifyTotp(secret, `${totpCode(secret, step).slice(0, 3)} ${totpCode(secret, step).slice(3)}`, now)).toBe(
      step,
    );
  });

  it('builds the otpauth URI', () => {
    expect(otpauthUri('ABC', 'me@example.com', 'Workbench')).toBe(
      'otpauth://totp/Workbench:me%40example.com?secret=ABC&issuer=Workbench&algorithm=SHA1&digits=6&period=30',
    );
  });
});
