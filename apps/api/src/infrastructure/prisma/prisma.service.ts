import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { EnvironmentVariables } from '@/config/env.validation';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<EnvironmentVariables>) {
    // The same URL the Prisma CLI uses for migrations; no second way to spell the connection.
    const url = config.get('DATABASE_URL', { infer: true })!;

    super({ datasources: { db: { url } } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
