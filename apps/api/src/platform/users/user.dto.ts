import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { User } from '@prisma/client';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Anna' })
  @IsString()
  name!: string;
}

export class UserResponse {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'anna@example.com' })
  email!: string;

  @ApiProperty({ required: false, nullable: true, example: 'Anna' })
  name?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}


export type PublicUser = Omit<User, 'passwordHash' | 'totpSecret' | 'totpEnabledAt' | 'totpLastStep'>;
