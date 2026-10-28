import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaModule } from '@platform/db/prisma.module';
import { PrismaService } from '@platform/db/prisma.service';
import { MoneyModule } from '@tools/money/money.module';

/**
 * The money module wired to the real Postgres at DATABASE_URL (migrated), for
 * the done-when tests of each milestone. Every spec works with its own user.
 */
export async function moneyHarness(): Promise<{ app: TestingModule; prisma: PrismaService; newUser: (tag: string) => Promise<string> }> {
  const app = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({ DATABASE_URL: process.env.DATABASE_URL, APP_MODE: 'api', MONEY_SCHEDULER: 'off' })],
      }),
      PrismaModule,
      MoneyModule,
    ],
  }).compile();
  await app.init();
  const prisma = app.get(PrismaService);
  const newUser = async (tag: string) =>
    (
      await prisma.user.create({
        data: { email: `${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`, passwordHash: 'x' },
      })
    ).id;
  return { app, prisma, newUser };
}
