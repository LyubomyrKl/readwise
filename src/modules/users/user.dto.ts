import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'anna@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, example: 'S3curePass1' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'Anna' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class UserDto {
  @ApiProperty({ example: 'a2f1b1e0-...' })
  id: string;

  @ApiProperty({ example: 'anna@example.com' })
  email: string;
  

  @ApiProperty({ example: '2025-08-11T17:22:31.000Z' })
  createdAt: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Anna' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'en-US' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ example: 'America/New_York' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
