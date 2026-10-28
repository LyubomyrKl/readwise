import type { TestingModule } from '@nestjs/testing';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { ImportsService } from '@tools/money/imports/imports.service';
import type { MappingDto } from '@tools/money/imports/import.models';
import { MovementsService } from '@tools/money/movements/movements.service';
import { moneyHarness } from './money-harness';

/**
 * M2 done-when: the full history is in, and every account's balance equals
 * what the bank shows today (the opening balances make up the difference).
 */

interface Row {
  date: string;
  account: string;
  category: string;
  note: string;
  amount: string; // signed, "1234,56"
  currency: string;
  type: string;
}

/** ~180 rows over 2024-2026: salary, groceries, rent, transfers PLN->PLN and PLN->EUR. */
function history(): { rows: Row[]; expected: Record<string, bigint> } {
  const rows: Row[] = [];
  const expected: Record<string, bigint> = { 'mBank/PLN': 0n, 'Savings/PLN': 0n, 'ZEN/EUR': 0n };
  const fmt = (minor: bigint) => {
    const neg = minor < 0n;
    const v = (neg ? -minor : minor).toString().padStart(3, '0');
    return `${neg ? '-' : ''}${v.slice(0, -2)},${v.slice(-2)}`;
  };
  for (let m = 0; m < 30; m++) {
    const year = 2024 + Math.floor(m / 12);
    const month = String((m % 12) + 1).padStart(2, '0');
    const d = (day: number) => `${String(day).padStart(2, '0')}.${month}.${year}`;
    const salary = 1_050_000n + BigInt(m) * 1_234n;
    rows.push({ date: d(1), account: 'mBank', category: 'Salary', note: 'Salary', amount: fmt(salary), currency: 'PLN', type: 'Income' });
    expected['mBank/PLN'] += salary;
    rows.push({ date: d(3), account: 'mBank', category: 'Housing', note: 'Rent', amount: fmt(-320_000n), currency: 'PLN', type: 'Expense' });
    expected['mBank/PLN'] -= 320_000n;
    for (const [day, cents] of [[5, 12_345n], [12, 8_999n], [19, 15_001n], [26, 7_777n]] as const) {
      const c = cents + BigInt(m);
      rows.push({ date: d(day), account: 'mBank', category: 'Groceries', note: 'Biedronka', amount: fmt(-c), currency: 'PLN', type: 'Expense' });
      expected['mBank/PLN'] -= c;
    }
    // to savings, two rows
    rows.push({ date: d(10), account: 'mBank', category: '', note: 'Savings', amount: fmt(-200_000n), currency: 'PLN', type: 'Transfer-Out' });
    rows.push({ date: d(10), account: 'Savings', category: '', note: 'Savings', amount: fmt(200_000n), currency: 'PLN', type: 'Transfer-In' });
    expected['mBank/PLN'] -= 200_000n;
    expected['Savings/PLN'] += 200_000n;
    if (m % 3 === 0) {
      // to ZEN in EUR, two rows
      const eur = 23_045n + BigInt(m);
      rows.push({ date: d(15), account: 'mBank', category: '', note: 'FX', amount: fmt(-100_000n), currency: 'PLN', type: 'Transfer-Out' });
      rows.push({ date: d(15), account: 'ZEN', category: '', note: 'FX', amount: fmt(eur), currency: 'EUR', type: 'Transfer-In' });
      expected['mBank/PLN'] -= 100_000n;
      expected['ZEN/EUR'] += eur;
      rows.push({ date: d(20), account: 'ZEN', category: 'Travel', note: 'Hotel', amount: fmt(-15_000n), currency: 'EUR', type: 'Expense' });
      expected['ZEN/EUR'] -= 15_000n;
    }
  }
  return { rows, expected };
}

const toCsv = (rows: Row[]) =>
  ['Date;Account;Category;Note;Amount;Currency;Type', ...rows.map((r) => [r.date, r.account, r.category, r.note, r.amount, r.currency, r.type].join(';'))].join(
    '\r\n',
  );

const file = (name: string, text: string) => ({ buffer: Buffer.from(text, 'utf-8'), originalname: name });

describe('M2 history import', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let imports: ImportsService;
  let accounts: AccountsService;
  let movements: MovementsService;
  let userId: string;
  const { rows, expected } = history();

  // what the bank apps show today: the export missed 1000.00 PLN on mBank (it started with money),
  // Savings had 500.00 before, ZEN is exactly the history
  const screenshot: Record<string, bigint> = {
    'mBank/PLN': expected['mBank/PLN'] + 100_000n,
    'Savings/PLN': expected['Savings/PLN'] + 50_000n,
    'ZEN/EUR': expected['ZEN/EUR'],
  };
  const value = (minor: bigint) => {
    const neg = minor < 0n;
    const v = (neg ? -minor : minor).toString().padStart(3, '0');
    return `${neg ? '-' : ''}${v.slice(0, -2)}.${v.slice(-2)}`;
  };

  beforeAll(async () => {
    const h = await moneyHarness();
    app = h.app;
    prisma = h.prisma;
    userId = await h.newUser('m2');
    imports = app.get(ImportsService);
    accounts = app.get(AccountsService);
    movements = app.get(MovementsService);
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  const balanceOf = async (name: string, currency: string) => {
    const list = await accounts.list(userId);
    const account = list.find((a) => a.name === name)!;
    return account.balances.find((b) => b.commodityId === currency)!.balance!.minor;
  };

  let batchId: string;

  it('reads the export and suggests a mapping from the header', async () => {
    const batch = await imports.upload(userId, file('export-2026.csv', toCsv(rows)), { profile: 'money-manager' });
    batchId = batch.id;
    expect(batch.rowCount).toBe(rows.length + 1);
    expect(batch.accountNames).toEqual(['mBank', 'Savings', 'ZEN']);
    expect(batch.typeValuesFound).toEqual(['Expense', 'Income', 'Transfer-In', 'Transfer-Out']);
    expect(batch.suggestedMapping).toMatchObject({
      headerRow: 0,
      columns: { date: 0, account: 1, category: 2, note: [3], amount: 4, currency: 5, type: 6 },
      amountSign: 'type',
    });
  });

  it('asks for the accounts, then creates them with the currencies seen', async () => {
    const suggested = (await imports.get(userId, batchId)).suggestedMapping as MappingDto;
    const mapped = await imports.applyMapping(userId, batchId, suggested);
    expect(mapped.counts.error).toBe(rows.length);
    const withAccounts = await imports.createAccounts(userId, batchId, { names: ['mBank', 'Savings', 'ZEN'], institutionName: 'Old app' });
    expect(withAccounts.counts.error ?? 0).toBe(0);
    const transfersIn = rows.filter((r) => r.type === 'Transfer-In').length;
    expect(withAccounts.counts.ready).toBe(rows.length - transfersIn);
    const list = await accounts.list(userId);
    expect(list.map((a) => [a.name, a.balances.map((b) => b.commodityId)])).toEqual([
      ['mBank', ['PLN']],
      ['Savings', ['PLN']],
      ['ZEN', ['EUR']],
    ]);
  });

  it('derives the opening balances from what the bank shows today', async () => {
    const list = await accounts.list(userId);
    const id = (name: string) => list.find((a) => a.name === name)!.id;
    const preview = await imports.setTargets(userId, batchId, [
      { accountId: id('mBank'), currency: 'PLN', balance: value(screenshot['mBank/PLN']) },
      { accountId: id('Savings'), currency: 'PLN', balance: value(screenshot['Savings/PLN']) },
      { accountId: id('ZEN'), currency: 'EUR', balance: value(screenshot['ZEN/EUR']) },
    ]);
    const row = (name: string) => preview.find((p) => p.accountName === name)!;
    expect(row('mBank').change.minor).toBe(expected['mBank/PLN'].toString());
    expect(row('mBank').openingBalance?.value).toBe('1000.00');
    expect(row('mBank').openingDate).toBe('2023-12-31');
    expect(row('Savings').openingBalance?.value).toBe('500.00');
    expect(row('ZEN').openingBalance?.value).toBe('0.00');
  });

  it('commits everything in one go and every balance equals the screenshot to the cent', async () => {
    const result = await imports.commit(userId, batchId);
    const transfersIn = rows.filter((r) => r.type === 'Transfer-In').length;
    expect(result.imported).toBe(rows.length - transfersIn);
    expect(result.openingBalances).toBe(2);
    expect(await balanceOf('mBank', 'PLN')).toBe(screenshot['mBank/PLN'].toString());
    expect(await balanceOf('Savings', 'PLN')).toBe(screenshot['Savings/PLN'].toString());
    expect(await balanceOf('ZEN', 'EUR')).toBe(screenshot['ZEN/EUR'].toString());
    const categories = await prisma.moneyCategory.findMany({ where: { userId, name: { in: ['Travel', 'Housing'] } } });
    expect(categories.map((c) => c.kind).sort()).toEqual(['expense', 'expense']);
  });

  it('refuses the same file twice and holds back rows imported before', async () => {
    await expect(imports.upload(userId, file('export-2026.csv', toCsv(rows)), { profile: 'money-manager' })).rejects.toThrow(
      /was imported on/,
    );
    const extra: Row[] = [
      { date: '01.07.2026', account: 'mBank', category: 'Salary', note: 'Bonus', amount: '5000,00', currency: 'PLN', type: 'Income' },
      { date: '02.07.2026', account: 'mBank', category: 'Groceries', note: 'Lidl', amount: '-42,10', currency: 'PLN', type: 'Expense' },
    ];
    const overlapping = [...rows.slice(-20), ...extra];
    const batch = await imports.upload(userId, file('export-2026-07.csv', toCsv(overlapping)), { profile: 'money-manager' });
    const first = (await imports.get(userId, batchId)).mapping as MappingDto;
    const mapped = await imports.applyMapping(userId, batch.id, first);
    expect(mapped.counts.ready).toBe(2);
    expect(mapped.counts.duplicate).toBe(overlapping.filter((r) => r.type !== 'Transfer-In').length - 2);
    await imports.commit(userId, batch.id);
    expect(await balanceOf('mBank', 'PLN')).toBe((screenshot['mBank/PLN'] + 500_000n - 4_210n).toString());
  });

  it('matches a movement already recorded by hand instead of doubling it', async () => {
    const mbank = (await accounts.list(userId)).find((a) => a.name === 'mBank')!;
    await movements.post(
      userId,
      { kind: 'expense', input: { date: '2026-08-03', accountId: mbank.id, currency: 'PLN', amount: '77.70', note: 'Typed in by hand' } },
      { actor: 'user' },
    );
    const csv = toCsv([
      { date: '04.08.2026', account: 'mBank', category: 'Groceries', note: 'Carrefour', amount: '-77,70', currency: 'PLN', type: 'Expense' },
      { date: '04.08.2026', account: 'mBank', category: 'Groceries', note: 'Carrefour', amount: '-12,00', currency: 'PLN', type: 'Expense' },
    ]);
    const batch = await imports.upload(userId, file('august.csv', csv), { profile: 'money-manager' });
    const first = (await imports.get(userId, batchId)).mapping as MappingDto;
    const mapped = await imports.applyMapping(userId, batch.id, first);
    expect(mapped.counts).toMatchObject({ matched: 1, ready: 1 });
    const page = await imports.rows(userId, batch.id, { status: 'matched' });
    expect(page.items[0].message).toMatch(/looks like 2026-08-03 Typed in by hand/);
    // the user decides it is a different purchase after all
    await imports.setRowStatus(userId, batch.id, page.items[0].id, 'ready');
    const result = await imports.commit(userId, batch.id);
    expect(result.imported).toBe(2);
  });
});
