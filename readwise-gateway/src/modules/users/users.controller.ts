import { Controller, Patch, Body, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { ApiEndpoint } from '@/common/api-endpoint.decorator';
import { UpdateUserDto, UserResponse } from './user.dto';
import { UserModel } from '@/app.models';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  @ApiEndpoint({ summary: 'Update current user', response: UserResponse })
  updateMe(@Req() req: UserModel, @Body() dto: UpdateUserDto): Promise<UserResponse> {
    return this.users.update(req.user.userId, dto);
  }
}