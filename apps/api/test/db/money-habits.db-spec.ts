import type { TestingModule } from '@nestjs/testing';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { CategoriesService } from '@tools/money/categories/categories.service';
import { HabitsService } from '@tools/money/movements/habits.service';
import { MovementsService } from '@tools/money/movements/movements.service';
import { TransactionsService } from '@tools/money/transactions/transactions.service';
import { moneyHarness } from './money-harness';

/**
 * What quick entry learns from the history: the categories and accounts used most, the account
 * used last, and every note once with what it was last time, so typing "Lidl" brings back
 * Groceries and the card it was paid with. Only what stands counts: a reversed or replaced
 * movement teaches nothing, a merged category counts as the one it went into, and an archived
 * account is never offered.
 */
describe('habits for quick entry', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let habits: HabitsService;
  const users: string[] = [];
  let userId: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const h = await moneyHarness();
    app = h.app;
    prisma = h.prisma;
    habits = app.get(HabitsService);
    for (const tag of ['habits', 'stranger']) users.push(await h.newUser(`habits-${tag}`));
    userId = users[0];

    const accounts = app.get(AccountsService);
    const categories = app.get(CategoriesService);
    const movements = app.get(MovementsService);
    const transactions = app.get(TransactionsService);
    const account = async (name: string) => (await accounts.create(userId, { name, type: 'bank', currencies: ['PLN'] })).id;
    ids.mbank = await account('mBank');
    ids.cash = await account('Cash');
    ids.savings = await account('Savings');
    ids.old = await account('Old card');
    const all = await categories.list(userId);
    for (const name of ['Groceries', 'Transport', 'Leisure', 'Health', 'Shopping', 'Salary']) ids[name] = all.find((c) => c.name === name)!.id;
    ids.Transportation = (await categories.create(userId, { name: 'Transportation', kind: 'expense' })).id;

    const post = (kind: 'expense' | 'income' | 'transfer', input: Record<string, unknown>) =>
      movements.post(userId, { kind, input }, { actor: 'user' });
    const spend = (date: string, note: string, amount: string, category: string, accountId: string) =>
      post('expense', { date, note, amount, currency: 'PLN', categoryId: ids[category], accountId });

    await spend('2026-11-01', 'Lidl', '45.20', 'Groceries', ids.mbank);
    await spend('2026-11-02', 'Lidl', '50.00', 'Groceries', ids.mbank);
    await spend('2026-11-03', 'lidl', '12.00', 'Groceries', ids.cash);
    await spend('2026-11-04', 'Coffee', '9.00', 'Leisure', ids.cash);
    const mistake = await spend('2026-11-05', 'Mistake', '99.00', 'Shopping', ids.mbank);
    await transactions.reverse(userId, mistake.id, {});
    const typo = await spend('2026-11-06', 'Typo', '10.00', 'Transport', ids.mbank);
    await movements.correct(userId, typo.id, {
      kind: 'expense',
      input: { date: '2026-11-06', note: 'Bus', amount: '4.40', currency: 'PLN', categoryId: ids.Transport, accountId: ids.mbank },
    });
    await spend('2026-11-07', 'Train', '30.00', 'Transportation', ids.mbank);
    await categories.merge(userId, ids.Transportation, ids.Transport);
    await post('transfer', { date: '2026-11-08', note: 'To savings', fromAccountId: ids.mbank, fromCurrency: 'PLN', amountOut: '300.00', toAccountId: ids.savings, toCurrency: 'PLN' });
    await post('transfer', { date: '2026-11-15', note: 'To savings', fromAccountId: ids.mbank, fromCurrency: 'PLN', amountOut: '250.00', toAccountId: ids.savings, toCurrency: 'PLN' });
    await post('income', { date: '2026-11-10', note: 'Salary', amount: '5000.00', currency: 'PLN', categoryId: ids.Salary, accountId: ids.mbank });
    // the expense recorded last, on a card archived since
    await spend('2026-11-09', 'Kiosk', '3.00', 'Health', ids.old);
    await accounts.setArchived(userId, ids.old, true);
  });

  afterAll(async () => {
    for (const id of users) await prisma.user.delete({ where: { id } });
    await app.close();
  });

  it('ranks the categories and accounts used most; a merged category counts as the one it went into', async () => {
    const expense = await habits.habits(userId, 'expense');
    // Groceries 3; Transport 2 (Bus, which replaced Typo, and Train, booked in the merged Transportation)
    expect(expense.categories.slice(0, 2)).toEqual([ids.Groceries, ids.Transport]);
    expect(expense.categories).not.toContain(ids.Shopping); // only the reversed mistake was there
    expect(expense.categories).not.toContain(ids.Transportation);
    // mBank: Lidl, Lidl, Bus, Train; Cash: lidl, Coffee; the archived card not at all
    expect(expense.accounts).toEqual([ids.mbank, ids.cash]);
  });

  it('remembers each note once, whatever its case, with what it was last time', async () => {
    const { notes } = await habits.habits(userId, 'expense');
    expect(notes[0]).toEqual({
      note: 'lidl',
      count: 3,
      lastDate: '2026-11-03',
      categoryId: ids.Groceries,
      accountId: ids.cash,
      toAccountId: null,
      amount: { currency: 'PLN', minor: '1200', value: '12.00' },
    });
    const byNote = new Map(notes.map((n) => [n.note, n]));
    expect(byNote.get('Train')?.categoryId).toBe(ids.Transport);
    expect(byNote.get('Bus')).toMatchObject({ count: 1, amount: { value: '4.40' } });
    expect(byNote.has('Mistake')).toBe(false);
    expect(byNote.has('Typo')).toBe(false);
    // an archived account is never offered back
    expect(byNote.get('Kiosk')).toMatchObject({ categoryId: ids.Health, accountId: null });
  });

  it('takes the account of the movement recorded last, unless it is archived', async () => {
    expect((await habits.habits(userId, 'expense')).lastAccountId).toBeNull(); // Kiosk, on the archived card
    expect((await habits.habits(userId, 'income')).lastAccountId).toBe(ids.mbank);
  });

  it('learns a transfer with both of its accounts', async () => {
    const transfer = await habits.habits(userId, 'transfer');
    expect(transfer).toMatchObject({
      accounts: [ids.mbank],
      toAccounts: [ids.savings],
      lastAccountId: ids.mbank,
      lastToAccountId: ids.savings,
    });
    expect(transfer.notes[0]).toMatchObject({
      note: 'To savings',
      count: 2,
      accountId: ids.mbank,
      toAccountId: ids.savings,
      amount: { value: '250.00' },
    });
  });

  it("keeps to the user's own movements", async () => {
    const theirs = await habits.habits(users[1], 'expense');
    expect(theirs).toMatchObject({ categories: [], accounts: [], toAccounts: [], notes: [], lastAccountId: null });
  });
});
