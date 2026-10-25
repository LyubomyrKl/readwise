// src/modules/users/users.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import  { PublicUser} from './user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
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

  async update(userId: string, dto: { name?: string }): Promise<PublicUser> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
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
