import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto } from './auth.dto';
import {
  AuthBundle,
  Tokens,
  RefreshBundle,
  MePayload,
  LogoutResult,
} from './auth.models';
import { Authenticated } from '@/common/authenticated.decorator';
import {
  ApiTags,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ description: 'User registered', type: AuthBundle })
  @ApiBadRequestResponse({ description: 'Validation failed' })
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
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Login successful', type: AuthBundle })
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
  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: RefreshDto })
  @ApiOkResponse({ description: 'Tokens refreshed', type: Tokens })
  async refresh(@Body() dto: RefreshDto): Promise<RefreshBundle> {
    const raw = String(dto.refreshToken).replace(/^Bearer\s+/i, '');
    const tokens = await this.auth.refresh(raw);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  @Authenticated()
  @Get('me')
  @ApiOkResponse({ description: 'Current user', type: MePayload })
  me(@Req() req: { user: { userId: string; email: string } }): MePayload {
    return req.user;
  }

  @Authenticated()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Logged out', type: LogoutResult })
  async logout(
    @Req() req: { user: { userId: string; email: string } },
  ): Promise<LogoutResult> {
    await this.auth.logout(req.user.userId);
    return { success: true };
  }
}
