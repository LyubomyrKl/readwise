import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
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

export type ServiceTokens = { accessToken: string; refreshToken: string };
export type SafeUser = { id: string; email: string; name?: string | null };
export type AuthBundle = { user: SafeUser; tokens: ServiceTokens };
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
    const existingUser = await this.users.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hash = await argon2.hash(password);
    const user = await this.users.create(email, hash, name);
    const tokens = await this.issueTokens(user.id, user.email);
    const safe = this.mapToSafeUser(user);
    return { user: safe, tokens };
  }

  async validateUser(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user) return null;
    const ok = await argon2.verify(user.passwordHash, password);
    return ok ? user : null;
  }

  async login(email: string): Promise<AuthBundle> {
    const user = await this.users.findByEmail(email);

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.issueTokens(user.id, user.email);
    const safe = this.mapToSafeUser(user);
    return { user: safe, tokens };
  }

  private async issueTokens(
    userId: string,
    email: string,
  ): Promise<ServiceTokens> {
    const access = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.getJwtAccessSecret(),
        expiresIn: this.getJwtAccessTtl(),
      },
    );
    const refresh = await this.jwt.signAsync(
      { sub: userId, email, typ: 'refresh' },
      {
        secret: this.getJwtRefreshSecret(),
        expiresIn: this.getJwtRefreshTtl(),
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

  async rotate(userId: string, refreshToken: string): Promise<ServiceTokens> {
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

  private getJwtAccessSecret(): string {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new InternalServerErrorException(
        'JWT_ACCESS_SECRET not configured',
      );
    }
    return secret;
  }

  private getJwtRefreshSecret(): string {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
      throw new InternalServerErrorException(
        'JWT_REFRESH_SECRET not configured',
      );
    }
    return secret;
  }

  private getJwtAccessTtl(): string {
    return process.env.JWT_ACCESS_TTL || '15m';
  }

  private getJwtRefreshTtl(): string {
    return process.env.JWT_REFRESH_TTL || '7d';
  }

  private mapToSafeUser(user: {
    id: string;
    email: string;
    name: string | null;
  }): SafeUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
    };
  }

  async refresh(token: string): Promise<ServiceTokens> {
    const payload = await this.jwt.verifyAsync<RefreshPayload>(token, {
      secret: this.getJwtRefreshSecret(),
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
