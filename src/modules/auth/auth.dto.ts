import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'anna@example.com',
    description: 'Valid email address',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'S3curePass1',
    minLength: 8,
    description: 'Password with at least 8 characters',
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({
    example: 'Anna',
    minLength: 2,
    description: 'Full name of the user',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'anna@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'S3curePass1', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class RefreshDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI...' })
  @IsString()
  refreshToken!: string;
}
