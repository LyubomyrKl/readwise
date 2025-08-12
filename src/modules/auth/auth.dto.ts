import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

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
