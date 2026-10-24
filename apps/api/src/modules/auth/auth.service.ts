import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { add } from 'date-fns';
import { LoginDto, RefreshDto, RegisterDto } from './auth.models';

interface RefreshPayload {
  sub: string;
  email: string;
  typ?: string;
}

type JwtTtl = NonNullable<JwtSignOptions['expiresIn']>;

export type ServiceTokens = { accessToken: string; refreshToken: string };
export type SafeUser = { id: string; email: string; name?: string | null };
export type AuthBundle = { user: SafeUser; tokens: ServiceTokens };
export type LogoutResult = { success: true };

@Injectable()
export class AuthService {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async register(body: RegisterDto): Promise<AuthBundle> {
    const {email, password, name} = body;

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
        data: {
          email,
          passwordHash: hash,
          name,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      const tokens = await this.issueTokens(user.id, user.email);
      const safe = this.mapToSafeUser(user);
      return { user: safe, tokens };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new InternalServerErrorException('Registration failed');
    }
  }

  async validateUser(email: string, password: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
        },
      });

      if (!user) return null;

      const isValidPassword = await argon2.verify(user.passwordHash, password);
      return isValidPassword ? user : null;
    } catch {
      return null;
    }
  }

  async login(dto: LoginDto): Promise<AuthBundle> {
    try {
      const user = await this.validateUser(dto.email, dto.password);

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const tokens = await this.issueTokens(user.id, user.email);

      const safe = this.mapToSafeUser(user);

      return { user: safe, tokens };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException('Login failed');
    }
  }

  async refresh(dto: RefreshDto): Promise<ServiceTokens> {
    try {
      const token = String(dto.refreshToken).replace(/^Bearer\s+/i, '');

      const payload = await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: this.getJwtRefreshSecret(),
      });

      // Verify the refresh token exists in database and is not revoked
      await this.verifyRefreshToken(payload.sub, token);

      // Generate new access token but keep the same refresh token
      const accessToken = await this.jwt.signAsync(
        { sub: payload.sub, email: payload.email },
        {
          secret: this.getJwtAccessSecret(),
          expiresIn: this.getJwtAccessTtl(),
        },
      );

      return { accessToken, refreshToken: token };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async me(userId: string): Promise<{ userId: string; email: string }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
        },
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

  async logout(userId: string): Promise<LogoutResult> {
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

  private async verifyRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null },
    });

    if (tokens.length === 0) {
      throw new UnauthorizedException('No valid refresh tokens found');
    }

    const match = await Promise.any(
      tokens.map(async (t) =>
        (await argon2.verify(t.tokenHash, refreshToken))
          ? t
          : Promise.reject(new Error()),
      ),
    ).catch(() => null);

    if (!match) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async issueTokens(
    userId: string,
    email: string,
    revokeExisting = true,
  ): Promise<ServiceTokens> {
    try {
      // Revoke existing refresh tokens for this user if requested
      if (revokeExisting) {
        await this.prisma.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      const accessToken = await this.jwt.signAsync(
        { sub: userId, email },
        {
          secret: this.getJwtAccessSecret(),
          expiresIn: this.getJwtAccessTtl(),
        },
      );

      const refreshToken = await this.jwt.signAsync(
        { sub: userId, email, typ: 'refresh' },
        {
          secret: this.getJwtRefreshSecret(),
          expiresIn: this.getJwtRefreshTtl(),
        },
      );

      await this.prisma.refreshToken.create({
        data: {
          userId,
          tokenHash: await argon2.hash(refreshToken),
          expiresAt: add(new Date(), { days: 7 }),
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

  private getJwtAccessTtl(): JwtTtl {
    return (process.env.JWT_ACCESS_TTL || '15m') as JwtTtl;
  }

  private getJwtRefreshTtl(): JwtTtl {
    return (process.env.JWT_REFRESH_TTL || '7d') as JwtTtl;
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
}
