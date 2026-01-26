import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshDto,
  AuthBundle,
  Tokens,
  MePayload,
  LogoutResult,
} from './auth.models';
import { ApiEndpoint } from '@/common/api-endpoint.decorator';
import { UserModel } from '@/app.models';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiEndpoint({ summary: 'Register new user', response: AuthBundle, auth: false })
  async register(@Body() dto: RegisterDto): Promise<AuthBundle> {
    return await this.auth.register(dto);
  }

  @Post('login')
  @ApiEndpoint({ summary: 'Login user', response: AuthBundle, auth: false })
  async login(@Body() dto: LoginDto): Promise<AuthBundle> {
    return await this.auth.login(dto);
  }

  @Post('refresh')
  @ApiEndpoint({ summary: 'Refresh tokens', response: Tokens, auth: false })
  async refresh(@Body() dto: RefreshDto): Promise<Tokens> {
    return await this.auth.refresh(dto);
  }

  @Get('me')
  @ApiEndpoint({ summary: 'Get current user', response: MePayload })
  async me(@Req() req: UserModel): Promise<MePayload> {
    return await this.auth.me(req.user.userId);
  }

  @Post('logout')
  @ApiEndpoint({ summary: 'Logout user', response: LogoutResult })
  async logout(@Req() req: UserModel): Promise<LogoutResult> {
    return await this.auth.logout(req.user.userId);
  }
}