import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto } from './auth.dto';
import {
  AuthBundle,
  Tokens,
  RefreshBundle,
  MePayload,
  LogoutResult,
  ServiceTokens,
  SafeUser,
} from './auth.models';
import { Authenticated } from '@/common/authenticated.decorator';
import {
  ApiTags,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';

type LocalReq = Request & { user: { id: string; email: string } };
type JwtReq = Request & { user: MePayload };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ description: 'User registered', type: AuthBundle })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  async register(@Body() dto: RegisterDto): Promise<AuthBundle> {
    // assume service returns { user, tokens } or { id,email,name } + tokens separately
    const { user, tokens } = await this.auth.register(
      dto.email,
      dto.password,
      dto.name,
    );
    const safe: SafeUser = {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
    };
    const t: Tokens = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
    return { user: safe, tokens: t };
  }

  @UseGuards(AuthGuard('local'))
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Login successful', type: AuthBundle })
  async login(@Req() req: LocalReq): Promise<AuthBundle> {
    const out = await this.auth.login(req.user.id);
    const safe: SafeUser = {
      id: out.user.id,
      email: out.user.email,
      name: out.user.name ?? null,
    };
    const t: Tokens = {
      accessToken: out.tokens.accessToken,
      refreshToken: out.tokens.refreshToken,
    };
    return { user: safe, tokens: t };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RefreshDto })
  @ApiOkResponse({ description: 'Tokens refreshed', type: Tokens })
  async refresh(@Body() dto: RefreshDto): Promise<RefreshBundle> {
    const raw = String(dto.refreshToken).replace(/^Bearer\s+/i, '');
    const tokens: ServiceTokens = await this.auth.refresh(raw);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  @Authenticated()
  @Get('me')
  @ApiOkResponse({ description: 'Current user', type: MePayload })
  me(@Req() req: JwtReq): MePayload {
    return req.user;
  }

  @Authenticated()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Logged out', type: LogoutResult })
  async logout(@Req() req: JwtReq): Promise<LogoutResult> {
    await this.auth.logout(req.user.userId);
    return { success: true };
  }
}
