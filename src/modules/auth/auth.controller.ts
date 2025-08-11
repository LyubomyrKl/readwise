import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, RefreshDto } from './auth.dto';
import {
  ApiTags,
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { Authenticated } from '@/common/authenticated.decorator';

type LocalReq = Request & { user: { id: string; email: string } };
type JwtReq = Request & { user: { userId: string; email: string } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({
    description: 'User registered',
    schema: {
      example: {
        user: { id: 'uuid', email: 'anna@example.com', name: 'Anna' },
        tokens: { accessToken: 'jwt...', refreshToken: 'jwt...' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(
      String(dto.email),
      String(dto.password),
      dto.name ?? undefined,
    );
  }

  @UseGuards(AuthGuard('local'))
  @Post('login')
  @ApiBody({
    schema: { example: { email: 'anna@example.com', password: 'S3curePass1' } },
  })
  @ApiOkResponse({
    description: 'Login successful',
    schema: {
      example: {
        user: { id: 'uuid', email: 'anna@example.com', name: 'Anna' },
        tokens: { accessToken: 'jwt...', refreshToken: 'jwt...' },
      },
    },
  })
  login(@Req() req: LocalReq) {
    return this.auth.login(req.user.id, req.user.email);
  }

  @Post('refresh')
  @ApiBody({ type: RefreshDto })
  @ApiOkResponse({
    description: 'Tokens refreshed',
    schema: { example: { accessToken: 'jwt...', refreshToken: 'jwt...' } },
  })
  refresh(@Body() dto: RefreshDto) {
    const token = String(dto.refreshToken).replace(/^Bearer\s+/, '');
    return this.auth.refresh(token);
  }

  @Authenticated()
  @Get('me')
  @ApiOkResponse({
    description: 'Current user',
    schema: { example: { userId: 'uuid', email: 'anna@example.com' } },
  })
  me(@Req() req: JwtReq) {
    return req.user;
  }

  @Authenticated()
  @Post('logout')
  @ApiOkResponse({
    description: 'Logged out',
    schema: { example: { success: true } },
  })
  logout(@Req() req: JwtReq) {
    return this.auth.logout(req.user.userId);
  }
}
