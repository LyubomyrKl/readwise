import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto, RefreshDto } from './auth.dto';

type LocalReq = Request & { user: { id: string; email: string } };
type JwtReq = Request & { user: { userId: string; email: string } };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    const email = String(dto.email);
    const password = String(dto.password);
    const name = dto.name ?? undefined;
    return this.auth.register(email, password, name);
  }

  @UseGuards(AuthGuard('local'))
  @Post('login')
  login(@Req() req: LocalReq) {
    return this.auth.login(req.user.id, req.user.email);
  }

  // @Body is used to access the request body
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    const token = String(dto.refreshToken).replace(/^Bearer\s+/, '');
    return this.auth.refresh(token);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@Req() req: JwtReq) {
    return req.user;
  }

  //@Req is used to access the request object
  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  logout(@Req() req: JwtReq) {
    return this.auth.logout(req.user.userId);
  }
}
