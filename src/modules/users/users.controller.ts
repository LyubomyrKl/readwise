import { Controller, Patch, Body, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOkResponse, ApiBody } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Authenticated } from '@/common/authenticated.decorator';
import { UpdateUserDto } from './user.dto';

type JwtReq = Request & { user: { userId: string; email: string } };

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Profile updates useful for the summarizer UI (name, locale, timezone, avatar)
  @Authenticated()
  @Patch('me')
  @ApiBody({ type: UpdateUserDto })
  @ApiOkResponse({ description: 'Updated current user profile' })
  updateMe(@Req() req: JwtReq, @Body() dto: UpdateUserDto) {
    return this.users.update(req.user.userId, dto);
  }
}
