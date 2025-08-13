import { ApiProperty } from '@nestjs/swagger';

export class SafeUser {
  @ApiProperty({ example: 'uuid' }) id!: string;
  @ApiProperty({ example: 'anna@example.com' }) email!: string;
  @ApiProperty({ required: false, nullable: true, example: 'Anna' })
  name?: string | null;
}

export class Tokens {
  @ApiProperty({ example: 'jwt...' }) accessToken!: string;
  @ApiProperty({ example: 'jwt...' }) refreshToken!: string;
}

export type RefreshBundle = Tokens;

export class AuthBundle {
  @ApiProperty({ type: SafeUser }) user!: SafeUser;
  @ApiProperty({ type: Tokens }) tokens!: Tokens;
}

export class MePayload {
  @ApiProperty({ example: 'uuid' }) userId!: string;
  @ApiProperty({ example: 'anna@example.com' }) email!: string;
}

export class LogoutResult {
  @ApiProperty({ example: true }) success!: true;
}

export type ServiceTokens = { accessToken: string; refreshToken: string };
