import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    const opts: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET as string,
    };

    super(opts);
  }

  /**
   * Validate JWT payload.
   * @param payload JWT payload containing user ID and email.
   * @returns User object with userId and email.
   * Throws UnauthorizedException if validation fails.
   * This method is called by Passport.js to validate the JWT.
   **/
  validate(payload: JwtPayload) {
    return { userId: payload.sub, email: payload.email };
  }
}
