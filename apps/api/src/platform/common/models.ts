import { ApiProperty } from '@nestjs/swagger';

class UserDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ description: 'session id (the refresh token row)', required: false })
  sid?: string;
}

/** Shape of the request once the JWT guard ran. */
export class UserModel {
  @ApiProperty({ type: UserDto })
  user: UserDto;
}

export class SuccessEmptyResponse {
  @ApiProperty({ example: { status: 'success' } })
  status: 'success';
}
