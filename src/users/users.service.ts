import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }
  create(email: string, passwordHash: string, name?: string): Promise<User> {
    return this.prisma.user.create({ data: { email, passwordHash, name } });
  }
}
