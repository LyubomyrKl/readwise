import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '@platform/auth/auth.service';
import { PasswordService } from '@platform/auth/password.service';
import { createResetLink } from '@platform/auth/reset-links';
import type { PrismaService } from '@platform/db/prisma.service';
import type { MailMessage, MailService } from '@platform/mail/mail.service';

process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

/**
 * Changing a forgotten or known password against Postgres. Changing needs the current password
 * and ends the sessions on other devices; a forgotten one is set again through a one-time link
 * (by email, or printed on the server), which works once and for 30 minutes and ends every
 * session. The answer to "forgot password" never says whether an account has that email.
 */
describe('passwords against Postgres', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const auth = new AuthService(new JwtService({}), prisma);
  const sent: MailMessage[] = [];
  const mail = { enabled: true, send: async (m: MailMessage) => void sent.push(m) } as unknown as MailService;
  const passwords = new PasswordService(prisma, auth, mail);
  const email = `password-${Date.now()}@test.local`;
  const first = 'correct horse battery';
  const second = 'staple battery horse';
  const third = 'horse correct staple';
  let userId: string;

  /** the session id a token belongs to */
  const sidOf = (token: string) => (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { sid: string }).sid;
  const signsIn = (password: string) => auth.login({ email, password });
  const tokenOf = (link: string) => new URL(link).searchParams.get('token')!;

  beforeAll(async () => {
    userId = (await auth.register({ email, password: first })).user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('changes with the current password, and ends the sessions on the other devices only', async () => {
    const here = await signsIn(first);
    const there = await signsIn(first);
    const sid = sidOf(here.tokens.accessToken);

    await expect(passwords.change(userId, sid, { currentPassword: 'not it at all', newPassword: second })).rejects.toThrow('That password does not match');
    await expect(passwords.change(userId, sid, { currentPassword: first, newPassword: first })).rejects.toThrow(/other than the current one/);
    const changed = await passwords.change(userId, sid, { currentPassword: first, newPassword: second });
    expect(changed.success).toBe(true);
    expect(changed.signedOut).toBeGreaterThanOrEqual(1); // there, and the session register opened

    await expect(signsIn(first)).rejects.toThrow(UnauthorizedException);
    await expect(signsIn(second)).resolves.toMatchObject({ user: { email } });
    await expect(auth.refresh({ refreshToken: there.tokens.refreshToken })).rejects.toThrow('Invalid refresh token');
    await expect(auth.refresh({ refreshToken: here.tokens.refreshToken })).resolves.toHaveProperty('accessToken');
  });

  it('mails a link that sets a new password once, and ends every session', async () => {
    const signedIn = await signsIn(second);
    await expect(passwords.forgot(email)).resolves.toEqual({ delivery: 'email' });
    const mailed = sent.at(-1)!;
    expect(mailed.to).toBe(email);
    const link = mailed.text.match(/https?:\/\/\S+/)![0];
    expect(link).toContain('/auth/reset-password?token=');

    await expect(passwords.reset({ token: tokenOf(link), newPassword: third })).resolves.toEqual({ success: true });
    await expect(passwords.reset({ token: tokenOf(link), newPassword: 'yet another one' })).rejects.toThrow(/expired or was already used/);
    await expect(signsIn(second)).rejects.toThrow(UnauthorizedException);
    await expect(signsIn(third)).resolves.toMatchObject({ user: { email } });
    await expect(auth.refresh({ refreshToken: signedIn.tokens.refreshToken })).rejects.toThrow('Invalid refresh token');
  });

  it('answers the same for an email with no account, and sends nothing', async () => {
    const before = sent.length;
    await expect(passwords.forgot(`nobody-${Date.now()}@test.local`)).resolves.toEqual({ delivery: 'email' });
    expect(sent.length).toBe(before);
  });

  it('lets a newer link replace an older one, and an expired one set nothing', async () => {
    const older = await createResetLink(prisma, userId);
    const newer = await createResetLink(prisma, userId);
    await expect(passwords.reset({ token: tokenOf(older.link), newPassword: 'from the older link' })).rejects.toThrow(/expired/);

    await prisma.passwordReset.updateMany({ where: { userId, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(passwords.reset({ token: tokenOf(newer.link), newPassword: 'from the expired link' })).rejects.toThrow(/expired/);
    await expect(passwords.reset({ token: 'x'.repeat(43), newPassword: 'from no link at all' })).rejects.toThrow(/expired/);
    await expect(signsIn(third)).resolves.toMatchObject({ user: { email } });
  });

  it('on a server without email, says the link comes from the server, whose command makes one', async () => {
    const offline = new PasswordService(prisma, auth, { enabled: false } as unknown as MailService);
    await expect(offline.forgot(email)).resolves.toEqual({ delivery: 'server' });
    const { link, expiresAt } = await createResetLink(prisma, userId);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
    await expect(offline.reset({ token: tokenOf(link), newPassword: first })).resolves.toEqual({ success: true });
    await expect(signsIn(first)).resolves.toMatchObject({ user: { email } });
  });

  it('keeps only the hash of a link', async () => {
    const { link } = await createResetLink(prisma, userId);
    const rows = await prisma.passwordReset.findMany({ where: { userId } });
    expect(rows.some((r) => r.tokenHash === tokenOf(link))).toBe(false);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.tokenHash))).toBe(true);
  });
});
