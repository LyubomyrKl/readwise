import type { TestingModule } from '@nestjs/testing';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { CategoriesService } from '@tools/money/categories/categories.service';
import { DraftsService } from '@tools/money/drafts/drafts.service';
import { MovementsService } from '@tools/money/movements/movements.service';
import { TransactionsService } from '@tools/money/transactions/transactions.service';
import { moneyHarness } from './money-harness';

/** M1 done-when: a cross-currency transfer with a fee balances to zero per currency; balances add up to the cent. */
describe('M1 accounts and movements', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let accounts: AccountsService;
  let movements: MovementsService;
  let transactions: TransactionsService;
  let drafts: DraftsService;
  let categories: CategoriesService;
  let userId: string;
  let mbank: string;
  let zen: string;

  const post = (kind: Parameters<MovementsService['post']>[1]['kind'], input: Record<string, unknown>) =>
    movements.post(userId, { kind, input }, { actor: 'user' });

  const balance = async (accountId: string, currency: string) => {
    const account = await accounts.get(userId, accountId);
    return account.balances.find((b) => b.commodityId === currency)?.balance?.value;
  };

  beforeAll(async () => {
    ({ app, prisma } = await moneyHarness().then((h) => h));
    const h = { newUser: (tag: string) => prisma.user.create({ data: { email: `${tag}-${Date.now()}@test.local`, passwordHash: 'x' } }) };
    userId = (await h.newUser('m1')).id;
    accounts = app.get(AccountsService);
    movements = app.get(MovementsService);
    transactions = app.get(TransactionsService);
    drafts = app.get(DraftsService);
    categories = app.get(CategoriesService);

    const bank = await accounts.createInstitution(userId, { name: 'mBank', kind: 'bank' });
    const zenInst = await accounts.createInstitution(userId, { name: 'ZEN', kind: 'bank' });
    mbank = (
      await accounts.create(userId, {
        institutionId: bank.id,
        name: 'eKonto',
        type: 'bank',
        currencies: ['PLN', 'USD'],
        openingBalances: [{ currency: 'PLN', amount: '5000.00', date: '2026-01-01' }],
      })
    ).id;
    zen = (await accounts.create(userId, { institutionId: zenInst.id, name: 'ZEN', type: 'bank', currencies: ['PLN', 'EUR', 'USD'] })).id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('creates accounts with one sub-account per currency and the opening balance', async () => {
    const list = await accounts.list(userId);
    expect(list.map((a) => [a.name, a.balances.map((b) => b.commodityId)])).toEqual([
      ['eKonto', ['PLN', 'USD']],
      ['ZEN', ['EUR', 'PLN', 'USD']],
    ]);
    expect(await balance(mbank, 'PLN')).toBe('5000.00');
  });

  it('posts a cross-currency transfer with a fee that balances to zero per currency', async () => {
    const tx = await post('transfer', {
      date: '2026-10-02',
      fromAccountId: mbank,
      fromCurrency: 'PLN',
      amountOut: '1000.00',
      toAccountId: zen,
      toCurrency: 'EUR',
      amountIn: '230.45',
      fee: '2.00',
    });
    const net = new Map<string, bigint>();
    for (const e of tx.entries) net.set(e.subAccount.commodityId, (net.get(e.subAccount.commodityId) ?? 0n) + e.amountMinor!);
    expect(net).toEqual(
      new Map([
        ['PLN', 0n],
        ['EUR', 0n],
      ]),
    );
    const shown = await transactions.get(userId, tx.id);
    expect(shown.impliedRate).toBe('0.230912'); // 230.45 EUR for 998.00 PLN
    expect(shown.category?.name).toBe('Fees');
    expect(await balance(zen, 'EUR')).toBe('230.45');
    // its reversal shows the same rate, not the inverse
    const reversal = await transactions.reverse(userId, tx.id, { date: '2026-10-02' });
    expect(reversal.impliedRate).toBe('0.230912');
    expect(await balance(zen, 'EUR')).toBe('0.00');
    await post('transfer', { date: '2026-10-02', fromAccountId: mbank, fromCurrency: 'PLN', amountOut: '1000.00', toAccountId: zen, toCurrency: 'EUR', amountIn: '230.45', fee: '2.00' });
  });

  it('keeps every balance to the cent through income, expenses and transfers', async () => {
    const groceries = (await categories.list(userId)).find((c) => c.name === 'Groceries')!;
    const salary = (await categories.list(userId)).find((c) => c.name === 'Salary')!;
    await post('income', { date: '2026-10-10', accountId: mbank, currency: 'PLN', amount: '12345.67', categoryId: salary.id });
    await post('expense', { date: '2026-10-11', accountId: mbank, currency: 'PLN', amount: '0.10', categoryId: groceries.id });
    await post('expense', { date: '2026-10-11', accountId: mbank, currency: 'PLN', amount: '0.20', categoryId: groceries.id });
    await post('transfer', {
      date: '2026-10-12',
      fromAccountId: mbank,
      fromCurrency: 'PLN',
      amountOut: '500.50',
      toAccountId: zen,
      fee: '0.50',
    });
    // 5000.00 - 1000.00 + 12345.67 - 0.10 - 0.20 - 500.50
    expect(await balance(mbank, 'PLN')).toBe('15844.87');
    expect(await balance(zen, 'PLN')).toBe('500.00');
  });

  it('refuses a category of the wrong kind and an unknown account', async () => {
    const groceries = (await categories.list(userId)).find((c) => c.name === 'Groceries')!;
    await expect(
      post('income', { date: '2026-10-10', accountId: mbank, currency: 'PLN', amount: '1.00', categoryId: groceries.id }),
    ).rejects.toThrow(/expense category/);
    await expect(post('expense', { date: '2026-10-10', accountId: 'nope', currency: 'PLN', amount: '1.00' })).rejects.toThrow(
      /not found/,
    );
    await expect(post('expense', { date: '2026-10-10', accountId: mbank, currency: 'PLN', amount: '1.001' })).rejects.toThrow(
      /decimal places/,
    );
  });

  it('reverses and corrects without rewriting history', async () => {
    const expense = await post('expense', { date: '2026-10-15', accountId: mbank, currency: 'PLN', amount: '99.99' });
    const before = await balance(mbank, 'PLN');
    const reversal = await transactions.reverse(userId, expense.id, {});
    expect(reversal.kind).toBe('correction');
    expect(reversal.correctsId).toBe(expense.id);
    expect((await transactions.get(userId, expense.id)).reversedBy).toBe(reversal.id);
    expect(await balance(mbank, 'PLN')).toBe('15844.87');
    expect(before).toBe('15744.88');
    await expect(transactions.reverse(userId, expense.id, {})).rejects.toThrow(/already reversed/);

    const income = await post('income', { date: '2026-10-16', accountId: mbank, currency: 'PLN', amount: '100.00' });
    const fixed = await movements.correct(userId, income.id, {
      kind: 'income',
      input: { date: '2026-10-16', accountId: mbank, currency: 'PLN', amount: '110.00' },
    });
    expect(fixed.correctsId).toBe(income.id);
    const original = await transactions.get(userId, income.id);
    expect(original.replacedBy).toBe(fixed.id);
    expect(original.reversedBy).toBeTruthy();
    expect(await balance(mbank, 'PLN')).toBe('15954.87');
  });

  it('archives an account without losing its history', async () => {
    await accounts.setArchived(userId, zen, true);
    expect((await accounts.list(userId)).map((a) => a.name)).toEqual(['eKonto']);
    expect((await accounts.list(userId, { includeArchived: true })).map((a) => a.name)).toEqual(['eKonto', 'ZEN']);
    expect(await balance(zen, 'EUR')).toBe('230.45');
    await expect(post('income', { date: '2026-10-20', accountId: zen, currency: 'EUR', amount: '1.00' })).rejects.toThrow(
      /archived/,
    );
    const page = await transactions.list(userId, { accountId: zen });
    expect(page.items.length).toBeGreaterThan(0);
    await accounts.setArchived(userId, zen, false);
  });

  it('opens a debt below zero and refuses a positive one', async () => {
    const lender = await accounts.createInstitution(userId, { name: 'Family', kind: 'lender' });
    const debt = await accounts.create(userId, {
      institutionId: lender.id,
      name: 'Borrowed USD',
      type: 'debt',
      currencies: ['USD'],
      openingBalances: [{ currency: 'USD', amount: '-2000.00', date: '2026-03-01' }],
    });
    expect(debt.balances[0].balance?.value).toBe('-2000.00');
    await expect(
      accounts.create(userId, {
        institutionId: lender.id,
        name: 'Wrong',
        type: 'debt',
        currencies: ['USD'],
        openingBalances: [{ currency: 'USD', amount: '2000.00', date: '2026-03-01' }],
      }),
    ).rejects.toThrow(/negative/);
  });

  it('lists with filters and pages by cursor', async () => {
    const all = await transactions.list(userId, { accountId: mbank, limit: '500' });
    const first = await transactions.list(userId, { accountId: mbank, limit: '3' });
    const second = await transactions.list(userId, { accountId: mbank, limit: '3', before: first.nextCursor! });
    expect([...first.items, ...second.items].map((t) => t.id)).toEqual(all.items.slice(0, 6).map((t) => t.id));
    const october = await transactions.list(userId, { from: '2026-10-11', to: '2026-10-11' });
    expect(october.items.map((t) => t.kind)).toEqual(['expense', 'expense']);
    const byNote = await transactions.list(userId, { q: 'reverses' });
    expect(byNote.items.every((t) => t.kind === 'correction')).toBe(true);
  });

  it('holds drafts until they are approved', async () => {
    const draft = await drafts.create(
      userId,
      { kind: 'expense', input: { date: '2026-10-25', accountId: mbank, currency: 'PLN', amount: '40.00', note: 'Proposed' } },
      { actor: 'token:test' },
    );
    expect(draft.status).toBe('draft');
    expect(draft.entries).toEqual([]);
    expect(await balance(mbank, 'PLN')).toBe('15954.87');
    const posted = await drafts.approve(userId, draft.id, undefined);
    expect(posted.id).toBe(draft.id);
    expect(posted.status).toBe('posted');
    expect(await balance(mbank, 'PLN')).toBe('15914.87');

    const other = await drafts.create(userId, { kind: 'expense', input: { date: '2026-10-25', accountId: mbank } }, { actor: 'user' });
    await expect(drafts.approve(userId, other.id, undefined)).rejects.toThrow();
    // completed on approval: the posted draft keeps what was approved, not the proposal
    const completed = { date: '2026-10-25', accountId: mbank, currency: 'PLN', amount: '12.00', note: 'Completed' };
    const fixed = await drafts.approve(userId, other.id, completed);
    expect(fixed.draft).toEqual({ kind: 'expense', input: completed });
    await transactions.reverse(userId, fixed.id, {});
    const third = await drafts.create(userId, { kind: 'expense', input: { date: '2026-10-25', accountId: mbank } }, { actor: 'user' });
    await drafts.reject(userId, third.id);
    expect((await drafts.list(userId)).items).toEqual([]);
  });
});
