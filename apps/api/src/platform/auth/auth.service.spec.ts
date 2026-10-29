import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { FakePrisma } from '../../../test/fakes/fake-prisma';

/**
 * Sessions end to end against the in-memory Prisma double and real JWTs
 * (argon2 hashes are real too, hence the per-test cost of a few hundred ms).
 */
describe('AuthService sessions', () => {
  let prisma: FakePrisma;
  let service: AuthService;
  const jwt = new JwtService({});
  const decode = (token: string) => jwt.decode<{ sub: string; sid: string; typ?: string; exp: number }>(token);

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  beforeEach(() => {
    prisma = new FakePrisma();
    service = new AuthService(jwt, prisma as never);
  });

  const register = () => service.register({ email: 'a@example.com', password: 'S3curePass1', name: 'A' });

  it('register opens a session: both tokens carry the same sid and the row holds the refresh hash', async () => {
    const { user, tokens } = await register();

    expect(user).toMatchObject({ email: 'a@example.com', name: 'A' });
    const access = decode(tokens.accessToken);
    const refresh = decode(tokens.refreshToken);
    expect(access.sid).toBe(refresh.sid);
    expect(refresh.typ).toBe('refresh');
    const [row] = prisma.refreshToken.rows;
    expect(row.id).toBe(access.sid);
    expect(row.userId).toBe(user.id);
    expect(row.revokedAt).toBeNull();
    expect(row.tokenHash).not.toContain(tokens.refreshToken);
    await expect(register()).rejects.toBeInstanceOf(ConflictException);
  });

  it('takes only the first sign-up by default, and none when registration is closed', async () => {
    const previous = process.env.REGISTRATION;
    try {
      delete process.env.REGISTRATION;
      await register();
      await expect(service.register({ email: 'b@example.com', password: 'S3curePass1' })).rejects.toBeInstanceOf(ForbiddenException);
      process.env.REGISTRATION = 'closed';
      await expect(new AuthService(jwt, new FakePrisma() as never).register({ email: 'c@example.com', password: 'S3curePass1' })).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      process.env.REGISTRATION = previous;
    }
  });

  it('login opens another session and keeps the first one valid (several devices)', async () => {
    const first = await register();
    const second = await service.login({ email: 'a@example.com', password: 'S3curePass1' });

    expect(decode(second.tokens.accessToken).sid).not.toBe(decode(first.tokens.accessToken).sid);
    expect(prisma.refreshToken.rows.filter((r) => r.revokedAt === null)).toHaveLength(2);
    await expect(service.login({ email: 'a@example.com', password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refresh rotates the session: new pair, old refresh token revoked and rejected afterwards', async () => {
    const { tokens } = await register();

    const rotated = await service.refresh({ refreshToken: tokens.refreshToken });

    expect(rotated.accessToken).not.toBe(tokens.accessToken);
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);
    const oldSid = decode(tokens.refreshToken).sid;
    const newSid = decode(rotated.refreshToken).sid;
    expect(newSid).not.toBe(oldSid);
    expect(prisma.refreshToken.rows.find((r) => r.id === oldSid)!.revokedAt).toBeInstanceOf(Date);
    expect(prisma.refreshToken.rows.find((r) => r.id === newSid)!.revokedAt).toBeNull();

    await expect(service.refresh({ refreshToken: tokens.refreshToken })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh({ refreshToken: 'Bearer ' + rotated.refreshToken })).resolves.toMatchObject({ accessToken: expect.any(String) });
  });

  it('refresh rejects garbage, access tokens used as refresh tokens, and expired sessions', async () => {
    const { tokens } = await register();
    await expect(service.refresh({ refreshToken: 'garbage' })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh({ refreshToken: tokens.accessToken })).rejects.toBeInstanceOf(UnauthorizedException);

    const sid = decode(tokens.refreshToken).sid;
    await prisma.refreshToken.update({ where: { id: sid }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(service.refresh({ refreshToken: tokens.refreshToken })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout ends only the current session; logoutAll ends every session', async () => {
    const a = await register();
    const b = await service.login({ email: 'a@example.com', password: 'S3curePass1' });
    const userId = a.user.id;

    await service.logout(userId, decode(a.tokens.accessToken).sid);
    await expect(service.refresh({ refreshToken: a.tokens.refreshToken })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refresh({ refreshToken: b.tokens.refreshToken })).resolves.toBeDefined();

    const c = await service.login({ email: 'a@example.com', password: 'S3curePass1' });
    await service.logoutAll(userId);
    expect(prisma.refreshToken.rows.every((r) => r.revokedAt !== null)).toBe(true);
    await expect(service.refresh({ refreshToken: c.tokens.refreshToken })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
