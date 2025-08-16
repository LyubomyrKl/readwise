import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto } from './auth.dto';
import {
  AuthBundle,
  RefreshBundle,
  MePayload,
  LogoutResult,
} from './auth.models';
import { Authenticated } from '@/common/authenticated.decorator';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<AuthBundle> {
    return await this.auth.register(dto.email, dto.password, dto.name);
  }

  @Post('login')
  async login(@Body() dto: LoginDto): Promise<AuthBundle> {
    return await this.auth.login(dto);
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto): Promise<RefreshBundle> {
    return await this.auth.refresh(dto);
  }

  @Authenticated()
  @Get('me')
  async me(
    @Req() req: { user: { userId: string; email: string } },
  ): Promise<MePayload> {
    return await this.auth.me(req.user.userId);
  }

  @Authenticated()
  @Post('logout')
  async logout(
    @Req() req: { user: { userId: string; email: string } },
  ): Promise<LogoutResult> {
    return await this.auth.logout(req.user.userId);
  }
}
