import { Strategy } from 'passport-local'; // from passport-local
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private auth: AuthService) {
    super({ usernameField: 'email' });
  }

  /**
   * Validate user credentials.
   * @param email User's email.
   * @param password User's password.
   * @returns User req.user object if credentials are valid, otherwise throws UnauthorizedException.
   */
  async validate(email: string, password: string) {
    const user = await this.auth.validateUser(email, password);
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
