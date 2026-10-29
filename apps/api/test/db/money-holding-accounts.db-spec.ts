import type { TestingModule } from '@nestjs/testing';
import type { PrismaService } from '@platform/db/prisma.service';
import { AccountsService } from '@tools/money/accounts/accounts.service';
import { AssetsService } from '@tools/money/investments/assets.service';
import { MovementsService } from '@tools/money/movements/movements.service';
import { moneyHarness } from './money-harness';

/** Units are held only in investment or bonds accounts; the money for a buy may come from any account. */
describe('holding accounts', () => {
  let app: TestingModule;
  let prisma: PrismaService;
  let movements: MovementsService;
  let userId: string;
  let ibkr: string;
  let bonds: string;
  let mbank: string;
  let vwce: string;

  const post = (kind: Parameters<MovementsService['post']>[1]['kind'], input: Record<string, unknown>) =>
    movements.post(userId, { kind, input }, { actor: 'user' });
  const count = () => prisma.moneyTransaction.count({ where: { userId, kind: { in: ['buy', 'sell', 'unit_move'] } } });

  beforeAll(async () => {
    const h = await moneyHarness();
    app = h.app;
    prisma = h.prisma;
    userId = await h.newUser('holding');
    const accounts = app.get(AccountsService);
    movements = app.get(MovementsService);
    const broker = await accounts.createInstitution(userId, { name: 'IBKR', kind: 'broker' });
    const bank = await accounts.createInstitution(userId, { name: 'mBank', kind: 'bank' });
    const on = '2026-01-01';
    ibkr = (await accounts.create(userId, { institutionId: broker.id, name: 'IBKR', type: 'investment', currencies: ['EUR'], openingBalances: [{ currency: 'EUR', amount: '1000.00', date: on }] })).id;
    bonds = (await accounts.create(userId, { institutionId: broker.id, name: 'Bonds', type: 'bonds', currencies: ['EUR'] })).id;
    mbank = (await accounts.create(userId, { institutionId: bank.id, name: 'eKonto', type: 'bank', currencies: ['EUR'], openingBalances: [{ currency: 'EUR', amount: '5000.00', date: on }] })).id;
    vwce = (await app.get(AssetsService).create(userId, { code: 'VWCE', name: 'Vanguard FTSE All-World', quoteCurrency: 'EUR' })).id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await app.close();
  });

  it('refuses to buy into a bank account and writes nothing', async () => {
    await expect(post('buy', { date: '2026-02-02', accountId: mbank, assetId: vwce, units: '1', total: '100.00', currency: 'EUR' })).rejects.toThrow(
      /investment or bonds account/,
    );
    expect(await count()).toBe(0);
  });

  it('buys into an investment account paid from a bank account', async () => {
    await post('buy', { date: '2026-02-02', accountId: ibkr, assetId: vwce, units: '2', total: '200.00', currency: 'EUR', paidFromAccountId: mbank });
    expect(await count()).toBe(1);
  });

  it('refuses to sell from or move units into a bank account', async () => {
    await expect(post('sell', { date: '2026-02-03', accountId: mbank, assetId: vwce, units: '1', proceeds: '100.00', currency: 'EUR' })).rejects.toThrow(
      /investment or bonds account/,
    );
    await expect(post('unit_move', { date: '2026-02-03', fromAccountId: ibkr, toAccountId: mbank, assetId: vwce, units: '1' })).rejects.toThrow(
      /investment or bonds account/,
    );
    expect(await count()).toBe(1);
  });

  it('moves units between investment and bonds accounts', async () => {
    await post('unit_move', { date: '2026-02-04', fromAccountId: ibkr, toAccountId: bonds, assetId: vwce, units: '1' });
    expect(await count()).toBe(2);
  });
});
