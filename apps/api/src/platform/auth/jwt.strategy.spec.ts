import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { FakePrisma } from '../../../test/fakes/fake-prisma';

describe('JwtStrategy session check', () => {
  const payload = { sub: 'user-1', email: 'a@example.com', sid: 'session-1' };
  let prisma: FakePrisma;
  let strategy: JwtStrategy;

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
  });

  beforeEach(async () => {
    prisma = new FakePrisma();
    strategy = new JwtStrategy(prisma as never);
    await prisma.refreshToken.create({
      data: { id: 'session-1', userId: 'user-1', tokenHash: 'h', expiresAt: new Date(Date.now() + 60_000) },
    });
  });

  it('accepts a live session and exposes userId, email and sid', async () => {
    await expect(strategy.validate(payload)).resolves.toEqual({ userId: 'user-1', email: 'a@example.com', sid: 'session-1' });
  });

  it('rejects a revoked, expired, foreign or unknown session and tokens without a session', async () => {
    await prisma.refreshToken.update({ where: { id: 'session-1' }, data: { revokedAt: new Date() } });
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);

    await prisma.refreshToken.update({ where: { id: 'session-1' }, data: { revokedAt: null, expiresAt: new Date(Date.now() - 1) } });
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);

    await prisma.refreshToken.update({ where: { id: 'session-1' }, data: { expiresAt: new Date(Date.now() + 60_000), userId: 'someone-else' } });
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(strategy.validate({ ...payload, sid: 'nope' })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(strategy.validate({ ...payload, sid: undefined as unknown as string })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
