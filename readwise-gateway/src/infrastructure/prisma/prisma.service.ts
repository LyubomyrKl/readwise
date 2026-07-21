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
    const host = config.get('POSTGRES_HOST', { infer: true })!;
    const user = config.get('POSTGRES_USER', { infer: true })!;
    const password = config.get('POSTGRES_PASSWORD', { infer: true })!;
    const db = config.get('POSTGRES_DB', { infer: true })!;

    super({
      datasources: {
        db: {
          url: `postgresql://${user}:${password}@${host}:5432/${db}`,
        },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
