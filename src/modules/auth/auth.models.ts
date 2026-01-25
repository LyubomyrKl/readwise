import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

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


export class RegisterDto {
  @ApiProperty({ example: 'anna@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'S3curePass1' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ required: false, example: 'Anna' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'anna@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'S3curePass1' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ example: 'Bearer eyJhbGciOi...' })
  @IsString()
  refreshToken!: string;
}
