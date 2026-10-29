import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { add } from 'date-fns';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { LoginDto, RefreshDto, RegisterDto } from './auth.models';
import { verifyTotp } from './totp';

/**
 * Sessions. A session is one RefreshToken row; its id travels in both JWTs as
 * `sid`. Refreshing rotates the session (the old refresh token is revoked and a
 * new row is created), logout revokes one session, logoutAll revokes every
 * session of the user. Several sessions (devices) may be alive at once.
 */

export interface AccessPayload {
  sub: string;
  email: string;
  /** session id = RefreshToken.id */
  sid: string;
}

interface RefreshPayload extends AccessPayload {
  typ: 'refresh';
}

type JwtTtl = NonNullable<JwtSignOptions['expiresIn']>;

export type ServiceTokens = { accessToken: string; refreshToken: string };
export type SafeUser = { id: string; email: string; name?: string | null };
export type AuthBundle = { user: SafeUser; tokens: ServiceTokens };
export type LogoutResult = { success: true };

const REFRESH_DAYS = 7;

@Injectable()
export class AuthService {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async register(body: RegisterDto): Promise<AuthBundle> {
    const { email, password, name } = body;
    // the toolbox has one user: a public server takes the first sign-up only (REGISTRATION)
    const policy = process.env.REGISTRATION || 'first-user';
    if (policy === 'closed' || (policy === 'first-user' && (await this.prisma.user.count()) > 0)) {
      throw new ForbiddenException('Registration is closed on this server');
    }

    try {
      const existingUser = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      const hash = await argon2.hash(password);

      const user = await this.prisma.user.create({
        data: { email, passwordHash: hash, name },
        select: { id: true, email: true, name: true },
      });

      const tokens = await this.openSession(user.id, user.email);
      return { user: this.mapToSafeUser(user), tokens };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      // the same email registered by a request that ran alongside this one
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('User with this email already exists');
      }
      throw new InternalServerErrorException('Registration failed');
    }
  }

  async validateUser(email: string, password: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true, passwordHash: true, totpSecret: true, totpEnabledAt: true, totpLastStep: true },
      });

      if (!user) return null;

      const isValidPassword = await argon2.verify(user.passwordHash, password);
      return isValidPassword ? user : null;
    } catch {
      return null;
    }
  }

  /**
   * Opens a new session; other sessions of the user stay valid (several devices).
   * With the authenticator app turned on, the password alone is not enough: the
   * first attempt answers 401 with code TOTP_REQUIRED and the client asks for the code.
   */
  async login(dto: LoginDto): Promise<AuthBundle> {
    try {
      const user = await this.validateUser(dto.email, dto.password);

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      if (user.totpEnabledAt && user.totpSecret) {
        if (!dto.code) {
          throw new UnauthorizedException({
            statusCode: 401,
            error: 'Unauthorized',
            code: 'TOTP_REQUIRED',
            message: 'Enter the code from your authenticator app',
          });
        }
        const step = verifyTotp(user.totpSecret, dto.code, Date.now(), user.totpLastStep);
        if (step === null) {
          throw new UnauthorizedException({
            statusCode: 401,
            error: 'Unauthorized',
            code: 'TOTP_INVALID',
            message: 'That code does not match',
          });
        }
        await this.prisma.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
      }

      return await this.issueBundle(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException('Login failed');
    }
  }

  /**
   * Rotates the session: the presented refresh token is revoked and a new pair is
   * issued. A revoked, expired or unknown token is rejected.
   */
  async refresh(dto: RefreshDto): Promise<ServiceTokens> {
    const token = String(dto.refreshToken).replace(/^Bearer\s+/i, '');

    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: this.getJwtRefreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.typ !== 'refresh' || !payload.sid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.refreshToken.findUnique({ where: { id: payload.sid } });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt.getTime() < Date.now() ||
      !(await argon2.verify(session.tokenHash, token))
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return this.openSession(payload.sub, payload.email);
  }

  /**
   * Before a change to how one signs in (a new passkey, the authenticator app):
   * the password again, and the app's code when it is on, so a stolen session
   * cannot add a way in of its own. 400 rather than 401: the session is fine.
   */
  async confirm(userId: string, password: string, code?: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!valid) throw new BadRequestException('That password does not match');
    if (user.totpEnabledAt && user.totpSecret) {
      if (!code) throw new BadRequestException('Enter the code from your authenticator app');
      const step = verifyTotp(user.totpSecret, code, Date.now(), user.totpLastStep);
      if (step === null) throw new BadRequestException('That code does not match');
      await this.prisma.user.update({ where: { id: userId }, data: { totpLastStep: step } });
    }
  }

  async me(userId: string): Promise<{ userId: string; email: string }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return { userId: user.id, email: user.email };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to fetch user data');
    }
  }

  /** Ends the session the access token belongs to. */
  async logout(userId: string, sid: string | undefined): Promise<LogoutResult> {
    try {
      if (sid) {
        await this.prisma.refreshToken.updateMany({
          where: { id: sid, userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return { success: true };
    } catch {
      throw new InternalServerErrorException('Logout failed');
    }
  }

  /** Ends every session of the user (all devices). */
  async logoutAll(userId: string): Promise<LogoutResult> {
    try {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { success: true };
    } catch {
      throw new InternalServerErrorException('Logout failed');
    }
  }

  /** A new session for a user who already proved who they are (password and code, or a passkey). */
  async issueBundle(user: { id: string; email: string; name: string | null }): Promise<AuthBundle> {
    const tokens = await this.openSession(user.id, user.email);
    return { user: this.mapToSafeUser(user), tokens };
  }

  private async openSession(userId: string, email: string): Promise<ServiceTokens> {
    try {
      const sid = randomUUID();
      const accessToken = await this.jwt.signAsync(
        { sub: userId, email, sid } satisfies AccessPayload,
        { secret: this.getJwtAccessSecret(), expiresIn: this.getJwtAccessTtl() },
      );
      const refreshToken = await this.jwt.signAsync(
        { sub: userId, email, sid, typ: 'refresh' } satisfies RefreshPayload,
        { secret: this.getJwtRefreshSecret(), expiresIn: this.getJwtRefreshTtl() },
      );

      await this.prisma.refreshToken.create({
        data: {
          id: sid,
          userId,
          tokenHash: await argon2.hash(refreshToken),
          expiresAt: add(new Date(), { days: REFRESH_DAYS }),
        },
      });

      return { accessToken, refreshToken };
    } catch {
      throw new InternalServerErrorException('Failed to issue tokens');
    }
  }

  private getJwtAccessSecret(): string {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new InternalServerErrorException('JWT_ACCESS_SECRET not configured');
    }
    return secret;
  }

  private getJwtRefreshSecret(): string {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
      throw new InternalServerErrorException('JWT_REFRESH_SECRET not configured');
    }
    return secret;
  }

  private getJwtAccessTtl(): JwtTtl {
    return (process.env.JWT_ACCESS_TTL || '15m') as JwtTtl;
  }

  private getJwtRefreshTtl(): JwtTtl {
    return (process.env.JWT_REFRESH_TTL || '7d') as JwtTtl;
  }

  private mapToSafeUser(user: { id: string; email: string; name: string | null }): SafeUser {
    return { id: user.id, email: user.email, name: user.name ?? null };
  }
}
