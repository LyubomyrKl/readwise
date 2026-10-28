import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '@platform/auth/auth.service';
import { SecondFactorService } from '@platform/auth/second-factor.service';
import { timeStep, totpCode } from '@platform/auth/totp';
import type { PrismaService } from '@platform/db/prisma.service';

process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

describe('second factor against Postgres', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const auth = new AuthService(new JwtService({}), prisma);
  const config = { get: () => undefined } as unknown as ConfigService;
  const secondFactor = new SecondFactorService(prisma, auth, config);
  const email = `totp-${Date.now()}@test.local`;
  const password = 'correct horse battery';
  let userId: string;

  beforeAll(async () => {
    userId = (await auth.register({ email, password })).user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  const loginError = async (code?: string) => {
    try {
      await auth.login({ email, password, code });
    } catch (error) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      return (error as UnauthorizedException).getResponse() as { code?: string };
    }
    throw new Error('expected the login to fail');
  };

  it('signs in with the password alone while the app is off', async () => {
    await expect(auth.login({ email, password })).resolves.toMatchObject({ user: { email } });
  });

  it('needs a code after the app is turned on, and accepts each code once', async () => {
    const { secret, otpauthUrl, qrDataUrl } = await secondFactor.startTotp(userId);
    expect(otpauthUrl).toContain(`secret=${secret}`);
    expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);

    const now = timeStep(Date.now());
    await expect(secondFactor.enableTotp(userId, '000000')).rejects.toThrow(/does not match/);
    await secondFactor.enableTotp(userId, totpCode(secret, now));
    expect((await secondFactor.status(userId)).totpEnabled).toBe(true);

    expect((await loginError()).code).toBe('TOTP_REQUIRED');
    expect((await loginError('111111')).code).toBe('TOTP_INVALID');
    // the step used to turn it on is spent; the next one works, once
    const next = totpCode(secret, now + 1);
    await expect(auth.login({ email, password, code: next })).resolves.toMatchObject({ user: { email } });
    expect((await loginError(next)).code).toBe('TOTP_INVALID');

    await expect(secondFactor.disableTotp(userId, '000000')).rejects.toThrow(/does not match/);
  });

  it('refuses a passkey it does not know and spends the challenge', async () => {
    const options = await secondFactor.authenticationOptions(email);
    expect(options.challenge).toBeTruthy();
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: 'http://localhost:3000' }),
    ).toString('base64url');
    const response = {
      id: 'unknown-credential',
      rawId: 'unknown-credential',
      type: 'public-key' as const,
      clientExtensionResults: {},
      response: { clientDataJSON, authenticatorData: '', signature: '' },
    };
    await expect(secondFactor.signInWithPasskey(response)).rejects.toThrow('Unknown passkey');
    await expect(secondFactor.signInWithPasskey(response)).rejects.toThrow(/expired/);
  });

  it('creates registration options that exclude nothing for a new user', async () => {
    const options = await secondFactor.registrationOptions(userId);
    expect(options.rp.id).toBe('localhost');
    expect(options.excludeCredentials).toEqual([]);
    expect(options.authenticatorSelection?.userVerification).toBe('required');
  });
});
