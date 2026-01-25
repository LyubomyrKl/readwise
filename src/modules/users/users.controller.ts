import { Controller, Patch, Body, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { Authenticated } from '@/common/authenticated.decorator';
import { UpdateUserDto } from './user.dto';
import { UserModel } from '@/app.models';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Authenticated()
  @Patch('me')
  updateMe(@Req() req: UserModel, @Body() dto: UpdateUserDto) {
    return this.users.update(req.user.userId, dto);
  }
}
