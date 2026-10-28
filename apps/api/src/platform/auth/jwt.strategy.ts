import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';
import { PrismaService } from '@platform/db/prisma.service';
import type { AccessPayload } from './auth.service';

export type JwtPayload = AccessPayload;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    const opts: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET as string,
    };

    super(opts);
  }

  /**
   * Called by Passport with the verified payload; the result becomes req.user.
   * The session row is checked on every request (one primary-key lookup) so
   * that logout and "sign out everywhere" take effect at once instead of when
   * the access token expires.
   */
  async validate(payload: JwtPayload) {
    if (!payload.sid) {
      throw new UnauthorizedException('Session ended');
    }
    const session = await this.prisma.refreshToken.findUnique({ where: { id: payload.sid } });
    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session ended');
    }
    return { userId: payload.sub, email: payload.email, sid: payload.sid };
  }
}
