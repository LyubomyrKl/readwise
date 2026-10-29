import type { TestingModule } from '@nestjs/testing';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { DraftsService } from '@tools/money/drafts/drafts.service';
import { AssetsService } from '@tools/money/investments/assets.service';
import { PositionsService } from '@tools/money/investments/positions.service';
import { MovementsService } from '@tools/money/movements/movements.service';
import { TransactionsService } from '@tools/money/transactions/transactions.service';
import { moneyHarness } from './money-harness';

/** Two writes of one user at the same moment: the second sees what the first committed. */
describe('money writes at the same time', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let movements: MovementsService;
  let userId: string;
  let ibkr: string;
  let vwce: string;

  const post = (kind: Parameters<MovementsService['post']>[1]['kind'], input: Record<string, unknown>) =>
    movements.post(userId, { kind, input }, { actor: 'user' });
  const outcomes = async (...writes: (() => Promise<unknown>)[]) => {
    const settled = await Promise.allSettled(writes.map((w) => w()));
    return {
      done: settled.filter((s) => s.status === 'fulfilled').length,
      errors: settled.flatMap((s) => (s.status === 'rejected' ? [s.reason as Error] : [])),
    };
  };

  beforeAll(async () => {
    const h = await moneyHarness();
    app = h.app;
    prisma = h.prisma;
    userId = await h.newUser('concurrency');
    movements = app.get(MovementsService);
    const accounts = app.get(AccountsService);
    const broker = await accounts.createInstitution(userId, { name: 'IBKR', kind: 'broker' });
    ibkr = (
      await accounts.create(userId, {
        institutionId: broker.id,
        name: 'IBKR',
        type: 'investment',
        currencies: ['EUR'],
        openingBalances: [{ currency: 'EUR', amount: '10000.00', date: '2025-01-01' }],
      })
    ).id;
    vwce = (await app.get(AssetsService).create(userId, { code: 'VWCE', name: 'All-World', quoteCurrency: 'EUR' })).id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('sells units once, however many sales ask for them at once', async () => {
    await post('buy', { date: '2025-02-03', accountId: ibkr, assetId: vwce, units: '10', total: '1000.00', currency: 'EUR' });
    const sell = () => post('sell', { date: '2025-03-03', accountId: ibkr, assetId: vwce, units: '10', proceeds: '1100.00', currency: 'EUR' });
    const { done, errors } = await outcomes(sell, sell, sell);
    expect(done).toBe(1);
    expect(errors.map((e) => e.message)).toEqual([expect.stringMatching(/units/), expect.stringMatching(/units/)]);
    const [lot] = await app.get(PositionsService).lotList(userId, { accountId: ibkr, assetId: vwce });
    expect(lot.remainingUnits).toBe('0');
    expect(await prisma.moneyTransaction.count({ where: { userId, kind: 'sell' } })).toBe(1);
  });

  it('reverses a transaction once', async () => {
    const fee = await post('fee', { date: '2025-03-04', accountId: ibkr, currency: 'EUR', amount: '5.00' });
    const reverse = () => app.get(TransactionsService).reverse(userId, fee.id, {});
    const { done, errors } = await outcomes(reverse, reverse);
    expect(done).toBe(1);
    expect(errors.map((e) => e.message)).toEqual(['this transaction was already reversed']);
    expect(await prisma.moneyTransaction.count({ where: { correctsId: fee.id } })).toBe(1);
  });

  it('posts a draft once, however many approvals arrive at once', async () => {
    const drafts = app.get(DraftsService);
    const draft = await drafts.create(userId, { kind: 'fee', input: { date: '2025-03-05', accountId: ibkr, currency: 'EUR', amount: '2.00' } }, { actor: 'user' });
    const approve = () => drafts.approve(userId, draft.id, undefined);
    const { done, errors } = await outcomes(approve, approve);
    expect(done).toBe(1);
    expect(errors.map((e) => e.message)).toEqual(['draft not found or already posted']);
    expect(await prisma.moneyEntry.count({ where: { transactionId: draft.id } })).toBe(2);
  });
});
