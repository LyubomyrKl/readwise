import type { TestingModule } from '@nestjs/testing';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { CategoriesService } from '@tools/money/categories/categories.service';
import { LedgerService } from '@tools/money/ledger/ledger.service';
import { MovementsService } from '@tools/money/movements/movements.service';
import { TransactionsService } from '@tools/money/transactions/transactions.service';
import { ViewsService } from '@tools/money/views/views.service';
import { moneyHarness } from './money-harness';

/**
 * Keeping the books tidy without rewriting them: the history shows what stands (a
 * corrected movement once, a reversed one not at all, the trail on request), accounts
 * keep the order they are dragged into, and a merged category disappears while its
 * history counts under the category it went into. No posted row changes (rule 4).
 */
describe('tidy books', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let accounts: AccountsService;
  let categories: CategoriesService;
  let movements: MovementsService;
  let transactions: TransactionsService;
  let views: ViewsService;
  const users: string[] = [];

  beforeAll(async () => {
    const h = await moneyHarness();
    app = h.app;
    prisma = h.prisma;
    accounts = app.get(AccountsService);
    categories = app.get(CategoriesService);
    movements = app.get(MovementsService);
    transactions = app.get(TransactionsService);
    views = app.get(ViewsService);
    for (const tag of ['history', 'order', 'merge', 'dupes']) users.push(await h.newUser(`tidy-${tag}`));
  });

  afterAll(async () => {
    for (const id of users) await prisma.user.delete({ where: { id } });
    await app.close();
  });

  const expense = (userId: string, input: Record<string, unknown>) =>
    movements.post(userId, { kind: 'expense', input: { currency: 'PLN', ...input } }, { actor: 'user' });
  const ids = (page: { items: { id: string }[] }) => page.items.map((t) => t.id);

  describe('the history shows what stands', () => {
    let userId: string;
    let kept: string;
    let corrected: string;
    let replacement: string;
    let deleted: string;

    beforeAll(async () => {
      userId = users[0];
      const mbank = (await accounts.create(userId, { name: 'mBank', type: 'bank', currencies: ['PLN'] })).id;
      kept = (await expense(userId, { date: '2026-11-01', accountId: mbank, amount: '10.00', note: 'bread' })).id;
      corrected = (await expense(userId, { date: '2026-11-02', accountId: mbank, amount: '20.00', note: 'typo' })).id;
      replacement = (await movements.correct(userId, corrected, {
        kind: 'expense',
        input: { date: '2026-11-02', accountId: mbank, currency: 'PLN', amount: '25.00', note: 'fixed' },
      })).id;
      deleted = (await expense(userId, { date: '2026-11-03', accountId: mbank, amount: '30.00', note: 'never happened' })).id;
      await transactions.reverse(userId, deleted, {});
    });

    it('lists a corrected movement once and a reversed one not at all', async () => {
      const page = await transactions.list(userId, {});
      expect(ids(page)).toEqual([replacement, kept]);
      expect(page.items[0]).toMatchObject({ correctsId: corrected, note: 'fixed' });
    });

    it('shows the whole trail on request, and the reversals when asked for by kind', async () => {
      const all = await transactions.list(userId, { all: 'true' });
      expect(all.items).toHaveLength(6); // three movements, a replacement and two reversals
      expect(all.items.find((t) => t.id === corrected)?.reversedBy).toBeTruthy();
      const reversals = await transactions.list(userId, { kind: 'correction' });
      expect(reversals.items.map((t) => t.correctsId).sort()).toEqual([corrected, deleted].sort());
    });

    it('pages through what stands only', async () => {
      const first = await transactions.list(userId, { limit: '1' });
      expect(ids(first)).toEqual([replacement]);
      const second = await transactions.list(userId, { limit: '1', before: first.nextCursor! });
      expect(ids(second)).toEqual([kept]);
      expect(second.nextCursor).toBeNull();
    });
  });

  describe('accounts keep the order they are dragged into', () => {
    let userId: string;
    const names = async () => (await accounts.list(userId)).map((a) => a.name);

    beforeAll(() => {
      userId = users[1];
    });

    it('lists in the saved order; a new account comes last', async () => {
      const pko = (await accounts.create(userId, { name: 'PKO', type: 'bank', currencies: ['PLN'] })).id;
      const zen = (await accounts.create(userId, { name: 'ZEN', type: 'bank', currencies: ['EUR'] })).id;
      const ibkr = (await accounts.create(userId, { name: 'IBKR', type: 'investment', currencies: ['USD'] })).id;
      expect(await names()).toEqual(['PKO', 'ZEN', 'IBKR']);

      await accounts.reorder(userId, [ibkr, pko, zen]);
      expect(await names()).toEqual(['IBKR', 'PKO', 'ZEN']);

      await accounts.create(userId, { name: 'Cash', type: 'bank', currencies: ['PLN'] });
      expect(await names()).toEqual(['IBKR', 'PKO', 'ZEN', 'Cash']);
    });

    it('takes exactly the accounts in use, archived ones aside', async () => {
      const list = await accounts.list(userId);
      const [ibkr, pko, zen, cash] = list.map((a) => a.id);
      await expect(accounts.reorder(userId, [ibkr, pko, zen])).rejects.toThrow(/every account/);
      await expect(accounts.reorder(userId, [ibkr, pko, zen, cash, cash])).rejects.toThrow(/every account/);
      const system = await prisma.moneyAccount.findFirstOrThrow({ where: { userId, type: 'system' } });
      await expect(accounts.reorder(userId, [ibkr, pko, zen, system.id])).rejects.toThrow(/every account/);
      const stranger = (await accounts.create(users[0], { name: 'Not yours', type: 'bank', currencies: ['PLN'] })).id;
      await expect(accounts.reorder(userId, [ibkr, pko, zen, stranger])).rejects.toThrow(/every account/);

      await accounts.setArchived(userId, zen, true);
      await accounts.reorder(userId, [cash, ibkr, pko]);
      expect(await names()).toEqual(['Cash', 'IBKR', 'PKO']);
    });
  });

  describe('a merged category disappears and counts in the other', () => {
    let userId: string;
    let mbank: string;
    let transport: string;
    let transportation: string;

    beforeAll(async () => {
      userId = users[2];
      mbank = (await accounts.create(userId, { name: 'mBank', type: 'bank', currencies: ['PLN'] })).id;
      transport = (await categories.list(userId)).find((c) => c.name === 'Transport')!.id;
      transportation = (await categories.create(userId, { name: 'Transportation', kind: 'expense' })).id;
      await expense(userId, { date: '2026-03-03', accountId: mbank, amount: '100.00', categoryId: transportation, note: 'train' });
      await expense(userId, { date: '2026-03-04', accountId: mbank, amount: '50.00', categoryId: transport, note: 'bus' });
    });

    it('relabels the history and the month without changing a posted row', async () => {
      const ledgerBefore = await prisma.moneyTransaction.findMany({ where: { userId }, include: { entries: true }, orderBy: { id: 'asc' } });

      const into = await categories.merge(userId, transportation, transport);
      expect(into).toMatchObject({ id: transport, name: 'Transport' });
      expect((await categories.list(userId)).map((c) => c.name)).not.toContain('Transportation');

      const history = await transactions.list(userId, {});
      expect(history.items.map((t) => [t.note, t.category?.name])).toEqual([
        ['bus', 'Transport'],
        ['train', 'Transport'],
      ]);
      expect(history.items.flatMap((t) => t.entries.filter((e) => e.categoryId).map((e) => e.categoryName))).toEqual(['Transport', 'Transport']);
      expect(ids(await transactions.list(userId, { categoryId: transport }))).toHaveLength(2);

      const march = await views.month(userId, '2026-03');
      expect(march.expensesByCategory.map((c) => [c.name, c.value.value])).toEqual([['Transport', '150.00']]);

      const ledgerAfter = await prisma.moneyTransaction.findMany({ where: { userId }, include: { entries: true }, orderBy: { id: 'asc' } });
      expect(ledgerAfter).toEqual(ledgerBefore);
    });

    it('books a movement given the merged category into the other one', async () => {
      const tx = await expense(userId, { date: '2026-03-05', accountId: mbank, amount: '7.00', categoryId: transportation, note: 'tram' });
      const row = await prisma.moneyTransaction.findUniqueOrThrow({ where: { id: tx.id }, include: { entries: true } });
      expect(row.categoryId).toBe(transport);
      expect(row.entries.filter((e) => e.categoryId).map((e) => e.categoryId)).toEqual([transport]);
    });

    it('follows a second merge, and refuses what would lose meaning', async () => {
      const transit = (await categories.create(userId, { name: 'Transit', kind: 'expense' })).id;
      await categories.merge(userId, transport, transit);
      const history = await transactions.list(userId, {});
      expect(new Set(history.items.map((t) => t.category?.name))).toEqual(new Set(['Transit']));

      const all = await categories.list(userId);
      const otherExpenses = all.find((c) => c.key === 'other_expense')!.id;
      const salary = all.find((c) => c.name === 'Salary')!.id;
      await expect(categories.merge(userId, otherExpenses, transit)).rejects.toThrow(/built in/);
      await expect(categories.merge(userId, salary, transit)).rejects.toThrow(/kind/);
      await expect(categories.merge(userId, transit, transit)).rejects.toThrow(/itself/);
      await expect(categories.merge(userId, transit, transport)).rejects.toThrow(/not found/);
      const rail = (await categories.create(userId, { name: 'Rail', kind: 'expense', parentId: transit })).id;
      await expect(categories.merge(userId, transit, rail)).rejects.toThrow(/own subcategory/);
    });

    it('keeps rule 4 in the database: a posted category still cannot be changed by hand', async () => {
      const posted = await prisma.moneyTransaction.findFirstOrThrow({ where: { userId, status: 'posted', categoryId: transportation } });
      await expect(
        prisma.moneyTransaction.update({ where: { id: posted.id }, data: { categoryId: transport } }),
      ).rejects.toThrow(/immutable/);
    });
  });

  describe('the duplicates of the first import', () => {
    it('merge into the categories in use, once', async () => {
      const userId = users[3];
      await app.get(LedgerService).ensureSetup(userId);
      const make = (name: string, kind: 'income' | 'expense') => categories.create(userId, { name, kind });
      await make('Transportation', 'expense');
      await make('Home', 'expense');
      await make('Clothing, shopping', 'expense');
      await make('Other', 'expense');
      await make('Other', 'income');

      const [{ merged }] = await prisma.$queryRaw<{ merged: number }[]>`SELECT money_merge_import_duplicates() AS merged`;
      expect(merged).toBe(5);

      const rows = await prisma.moneyCategory.findMany({ where: { userId }, include: { mergedInto: true } });
      const into = (name: string, kind: string) => rows.find((c) => c.name === name && c.kind === kind)?.mergedInto?.name ?? null;
      expect(into('Transportation', 'expense')).toBe('Transport');
      expect(into('Housing', 'expense')).toBe('Home');
      expect(into('Shopping', 'expense')).toBe('Clothing, shopping');
      expect(into('Other', 'expense')).toBe('Other expenses');
      expect(into('Other', 'income')).toBe('Other income');
      expect(into('Groceries', 'expense')).toBeNull();

      const [{ merged: again }] = await prisma.$queryRaw<{ merged: number }[]>`SELECT money_merge_import_duplicates() AS merged`;
      expect(again).toBe(0);
    });
  });
});
