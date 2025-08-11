// src/modules/users/users.service.ts
import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

type PublicUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        passwordHash: true,
      },
    });
  }

  async create(
    email: string,
    passwordHash: string,
    name?: string,
  ): Promise<PublicUser> {
    return this.prisma.user.create({
      data: { email, passwordHash, name },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
