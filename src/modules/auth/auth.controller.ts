import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
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
    const result = await this.auth.register(dto.email, dto.password, dto.name);
    return {
      user: result.user,
      tokens: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
    };
  }

  @Post('login')
  async login(@Body() dto: LoginDto): Promise<AuthBundle> {
    const user = await this.auth.validateUser(dto.email, dto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const result = await this.auth.login(dto.email);

    return {
      user: result.user,
      tokens: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      },
    };
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto): Promise<RefreshBundle> {
    return await this.auth.refresh(dto);
  }

  @Authenticated()
  @Get('me')
  me(@Req() req: { user: { userId: string; email: string } }): MePayload {
    return req.user;
  }

  @Authenticated()
  @Post('logout')
  async logout(
    @Req() req: { user: { userId: string; email: string } },
  ): Promise<LogoutResult> {
    await this.auth.logout(req.user.userId);

    return { success: true };
  }
}
