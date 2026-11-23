import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshDto,
  AuthBundle,
  Tokens,
  MePayload,
  LogoutResult,
  ChangePasswordDto,
  PasswordChanged,
  ForgotPasswordDto,
  ForgotPasswordResult,
  ResetPasswordDto,
} from './auth.models';
import { PasswordService } from './password.service';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';

/** Credential endpoints get a tight per-IP budget (brute force); the rest shares the session budget. */
const CREDENTIAL_LIMITS = {
  short: { limit: 5, ttl: 1000 },
  medium: { limit: 30, ttl: 60_000 },
  long: { limit: 200, ttl: 3_600_000 },
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
  ) {}

  @Post('register')
  @Throttle(CREDENTIAL_LIMITS)
  @ApiEndpoint({ summary: 'Register new user', response: AuthBundle, auth: false })
  async register(@Body() dto: RegisterDto): Promise<AuthBundle> {
    return await this.auth.register(dto);
  }

  @Post('login')
  @Throttle(CREDENTIAL_LIMITS)
  @ApiEndpoint({ summary: 'Login user (opens a session; other sessions stay valid)', response: AuthBundle, auth: false })
  async login(@Body() dto: LoginDto): Promise<AuthBundle> {
    return await this.auth.login(dto);
  }

  @Post('refresh')
  @Throttle(CREDENTIAL_LIMITS)
  @ApiEndpoint({ summary: 'Rotate the session: new access and refresh tokens, the old refresh token is revoked', response: Tokens, auth: false })
  async refresh(@Body() dto: RefreshDto): Promise<Tokens> {
    return await this.auth.refresh(dto);
  }

  @Get('me')
  @ApiEndpoint({ summary: 'Get current user', response: MePayload })
  async me(@Req() req: UserModel): Promise<MePayload> {
    return await this.auth.me(req.user.userId);
  }

  @Post('logout')
  @ApiEndpoint({ summary: 'End this session', response: LogoutResult })
  async logout(@Req() req: UserModel): Promise<LogoutResult> {
    return await this.auth.logout(req.user.userId, req.user.sid);
  }

  @Post('logout-all')
  @ApiEndpoint({ summary: 'End every session of the user (all devices)', response: LogoutResult })
  async logoutAll(@Req() req: UserModel): Promise<LogoutResult> {
    return await this.auth.logoutAll(req.user.userId);
  }

  @Post('password')
  @Throttle(CREDENTIAL_LIMITS)
  @ApiEndpoint({
    summary: 'Change the password: the current one first (and the app code when on); the sessions on other devices end',
    response: PasswordChanged,
  })
  async changePassword(@Req() req: UserModel, @Body() dto: ChangePasswordDto): Promise<PasswordChanged> {
    return await this.passwords.change(req.user.userId, req.user.sid, dto);
  }

  @Post('password/forgot')
  @Throttle(CREDENTIAL_LIMITS)
  @ApiEndpoint({
    summary: 'Forgot password: a one-time link by email when the server sends email; the answer never says whether the account exists',
    response: ForgotPasswordResult,
    auth: false,
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<ForgotPasswordResult> {
    return await this.passwords.forgot(dto.email);
  }

  @Post('password/reset')
  @Throttle(CREDENTIAL_LIMITS)
  @ApiEndpoint({ summary: 'Set a new password with a one-time link; every session ends', response: LogoutResult, auth: false })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ success: true }> {
    return await this.passwords.reset(dto);
  }
}
