import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '@platform/db/prisma.service';
import { MailService } from '@platform/mail/mail.service';
import { AuthService } from './auth.service';
import type { ChangePasswordDto, ForgotPasswordResult, PasswordChanged, ResetPasswordDto } from './auth.models';
import { createResetLink, RESET_MINUTES, tokenHash } from './reset-links';

/**
 * The password: changed by the signed-in user (the current one first; every other session ends),
 * or set again through a one-time link when it is forgotten (every session ends; the
 * authenticator app, when on, is still asked for at sign-in). The link comes by email when the
 * server sends email; otherwise its owner prints one with the reset-password command.
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
  ) {}

  async change(userId: string, sid: string | undefined, dto: ChangePasswordDto): Promise<PasswordChanged> {
    await this.auth.confirm(userId, dto.currentPassword, dto.code);
    if (dto.newPassword === dto.currentPassword) throw new BadRequestException('Choose a password other than the current one');
    const passwordHash = await argon2.hash(dto.newPassword);
    const [, ended] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      // this device stays signed in; the others sign in again with the new password
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null, ...(sid ? { id: { not: sid } } : {}) },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { success: true, signedOut: ended.count };
  }

  /** The answer never says whether an account has that email; the email goes out on its own time. */
  async forgot(email: string): Promise<ForgotPasswordResult> {
    if (!this.mail.enabled) return { delivery: 'server' };
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (user) {
      const { link } = await createResetLink(this.prisma, user.id);
      this.mail
        .send({
          to: user.email,
          subject: 'Set a new Workbench password',
          text:
            `Someone, hopefully you, asked to set a new password for ${user.email} on Workbench.\n\n` +
            `Open this link to choose one. It works once, for ${RESET_MINUTES} minutes:\n${link}\n\n` +
            'Did not ask? Ignore this email: your password stays as it is.',
        })
        .catch((error: unknown) => this.logger.error(`the reset email did not go out: ${error instanceof Error ? error.message : String(error)}`));
    }
    return { delivery: 'email' };
  }

  async reset(dto: ResetPasswordDto): Promise<{ success: true }> {
    const passwordHash = await argon2.hash(dto.newPassword);
    const done = await this.prisma.$transaction(async (db) => {
      const link = await db.passwordReset.findUnique({ where: { tokenHash: tokenHash(dto.token) } });
      if (!link || link.usedAt || link.expiresAt.getTime() < Date.now()) return false;
      // spent before anything else, so the same link cannot set a password twice
      const spent = await db.passwordReset.updateMany({ where: { id: link.id, usedAt: null }, data: { usedAt: new Date() } });
      if (spent.count !== 1) return false;
      await db.user.update({ where: { id: link.userId }, data: { passwordHash } });
      // whoever was signed in with the old password is out, on every device
      await db.refreshToken.updateMany({ where: { userId: link.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      return true;
    });
    if (!done) throw new BadRequestException('This link has expired or was already used. Ask for a new one.');
    return { success: true };
  }
}
