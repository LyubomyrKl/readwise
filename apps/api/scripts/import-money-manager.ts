/**
 * Imports a money-manager history (the CSV from scripts/money-manager-xlsx-to-csv.py)
 * for one user through the money tool's own import (ImportsService): the same
 * mapping, account creation, duplicate detection and postings as the import screen,
 * straight against the database at DATABASE_URL. No login needed; nothing else of
 * the app has to run.
 *
 *   cd apps/api
 *   DATABASE_URL=postgresql://… npx ts-node -r tsconfig-paths/register -T scripts/import-money-manager.ts \
 *     --email you@example.com --file /path/export.csv [--commit] [--allow-errors]
 *
 * Without --commit it stops after the review: it prints the rows it cannot import and
 * each account's balance after the import, and leaves the batch as a preview (open it
 * under Money → Import, or run again with --commit). Accounts named in the file are
 * reused when the user has one of that name, otherwise created (institution
 * "Money Manager"; IBKR as an investment account, EDO as bonds, the rest as bank).
 */
import { readFileSync } from 'fs';
import { basename } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '@platform/db/prisma.module';
import { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { DEFAULT_TYPE_VALUES } from '@tools/money/core/money-manager';
import type { MappingDto } from '@tools/money/imports/import.models';
import { ImportsService } from '@tools/money/imports/imports.service';
import { MoneyModule } from '@tools/money/money.module';

const ACCOUNT_TYPES: Record<string, 'investment' | 'bonds'> = {
  IBKR: 'investment',
  EDO: 'bonds',
};
const INSTITUTION = 'Money Manager';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [
        () => ({
          DATABASE_URL: process.env.DATABASE_URL,
          APP_MODE: 'api',
          MONEY_SCHEDULER: 'off',
          MONEY_TIMEZONE: process.env.MONEY_TIMEZONE,
        }),
      ],
    }),
    PrismaModule,
    MoneyModule,
  ],
})
class ImportModule {}

function args() {
  const argv = process.argv.slice(2);
  const value = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const email = value('--email');
  const file = value('--file');
  if (!email || !file || !process.env.DATABASE_URL) {
    console.error(
      'usage: DATABASE_URL=… import-money-manager.ts --email <user> --file <export.csv> [--commit] [--allow-errors]',
    );
    process.exit(2);
  }
  return {
    email,
    file,
    commit: argv.includes('--commit'),
    allowErrors: argv.includes('--allow-errors'),
  };
}

async function main() {
  const opts = args();
  const app = await NestFactory.createApplicationContext(ImportModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const imports = app.get(ImportsService);
    const accounts = app.get(AccountsService);

    const user = await prisma.user.findUnique({ where: { email: opts.email } });
    if (!user)
      throw new Error(
        `no user ${opts.email} in this database; register in the app first`,
      );
    const userId = user.id;

    let batch = await imports.upload(
      userId,
      { buffer: readFileSync(opts.file), originalname: basename(opts.file) },
      { profile: 'money-manager' },
    );
    console.log(
      `batch ${batch.id}: ${batch.rowCount - 1} rows, ${batch.accountNames.length} accounts in the file`,
    );

    const existing = new Map(
      (await accounts.list(userId)).map((a) => [a.name, a.id]),
    );
    const known = Object.fromEntries(
      batch.accountNames
        .filter((n) => existing.has(n))
        .map((n) => [n, existing.get(n)!]),
    );
    const mapping: MappingDto = {
      headerRow: 0,
      columns: {
        date: 0,
        type: 1,
        account: 2,
        amount: 3,
        currency: 4,
        toAccount: 5,
        toAmount: 6,
        toCurrency: 7,
        category: 8,
        note: [9],
      },
      dateFormat: 'YYYY-MM-DD',
      decimalSeparator: '.',
      defaultCurrency: 'PLN',
      amountSign: 'type',
      typeValues: { ...DEFAULT_TYPE_VALUES },
      accounts: known,
    };
    batch = await imports.applyMapping(userId, batch.id, mapping);

    const missing = batch.accountNames.filter((n) => !existing.has(n));
    if (missing.length > 0) {
      batch = await imports.createAccounts(userId, batch.id, {
        names: missing,
        institutionName: INSTITUTION,
      });
      const created = new Map(
        (await accounts.list(userId)).map((a) => [a.name, a.id]),
      );
      for (const name of missing) {
        const type = ACCOUNT_TYPES[name];
        if (type) await accounts.update(userId, created.get(name)!, { type });
      }
      console.log(
        `created ${missing.length} accounts under "${INSTITUTION}"; reused ${Object.keys(known).length}`,
      );
    }

    console.log('rows by status:', batch.counts);
    const errors = await imports.rows(userId, batch.id, {
      status: 'error',
      limit: '500',
    });
    for (const row of errors.items)
      console.log(
        `  row ${row.rowNumber}: ${row.message} | ${row.raw.join(';')}`,
      );

    const preview = await imports.balancePreview(userId, batch.id);
    console.log('balances after the import (no opening balances):');
    for (const p of preview)
      console.log(
        `  ${p.accountName.padEnd(20)} ${p.after.value.padStart(14)} ${p.currency}${p.after.value.startsWith('-') ? '   (negative)' : ''}`,
      );

    if (!opts.commit) {
      console.log(
        'review only: run again with --commit to post it (the batch stays as a preview meanwhile)',
      );
      return;
    }
    if (errors.total > 0 && !opts.allowErrors) {
      throw new Error(
        `${errors.total} rows cannot be imported; fix them, or pass --allow-errors to post the rest`,
      );
    }
    const result = await imports.commit(userId, batch.id);
    console.log('committed:', result);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
