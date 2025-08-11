import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptions } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  email: string;
}

// This is a simplified version of the passport-jwt strategy
// function JwtStrategy(options, verify) {
//   if (!options || !options.jwtFromRequest) {
//     throw new TypeError('jwtFromRequest is required');
//   }

//   this._jwtFromRequest = options.jwtFromRequest;
//   this._secretOrKey = options.secretOrKey;
//   this._ignoreExpiration = !!options.ignoreExpiration;

//   passport.Strategy.call(this);
//   this.name = 'jwt';
//   this._verify = () => verify(JwtPayload);
// }

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
