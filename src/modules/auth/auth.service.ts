import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { add } from 'date-fns';

interface RefreshPayload {
  sub: string;
  email: string;
  typ?: string;
}

export type Tokens = { accessToken: string; refreshToken: string };
export type SafeUser = { id: string; email: string; name?: string | null };
export type AuthBundle = { user: SafeUser; tokens: Tokens };
export type LogoutResult = { success: true };

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async register(
    email: string,
    password: string,
    name?: string,
  ): Promise<AuthBundle> {
    const hash = await argon2.hash(password);
    const user = await this.users.create(email, hash, name);
    const tokens = await this.issueTokens(user.id, user.email);
    const safe: SafeUser = {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
    };
    return { user: safe, tokens };
  }

  async validateUser(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user) return null;
    const ok = await argon2.verify(user.passwordHash, password);
    return ok ? user : null;
  }

  async login(userId: string): Promise<AuthBundle> {
    const user = await this.users.findById(userId);

    if (!user) throw new UnauthorizedException();
    const tokens = await this.issueTokens(user.id, user.email);

    const safe: SafeUser = {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
    };
    return { user: safe, tokens };
  }

  private async issueTokens(userId: string, email: string): Promise<Tokens> {
    const access = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_TTL,
      },
    );
    const refresh = await this.jwt.signAsync(
      { sub: userId, email, typ: 'refresh' },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_TTL,
      },
    );
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: await argon2.hash(refresh),
        expiresAt: add(new Date(), { days: 7 }),
      },
    });
    return { accessToken: access, refreshToken: refresh };
  }

  async rotate(userId: string, refreshToken: string): Promise<Tokens> {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null },
    });
    const match = await Promise.any(
      tokens.map(async (t) =>
        (await argon2.verify(t.tokenHash, refreshToken))
          ? t
          : Promise.reject(new Error()),
      ),
    ).catch(() => null);
    if (!match) throw new UnauthorizedException();

    await this.prisma.refreshToken.update({
      where: { id: match.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return this.issueTokens(user.id, user.email);
  }

  async refresh(token: string): Promise<Tokens> {
    const payload = await this.jwt.verifyAsync<RefreshPayload>(token, {
      secret: process.env.JWT_REFRESH_SECRET,
    });
    return this.rotate(payload.sub, token);
  }

  async logout(userId: string): Promise<LogoutResult> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }
}
