import { PrismaClient } from '@prisma/client';
import { parseQuantity, quantityToDb } from '@tools/money/core/quantity';

/**
 * The rules the database enforces on its own (money_rules migration), against a
 * real Postgres with the migrations applied: DATABASE_URL must point at it.
 *   cd apps/api && npx prisma migrate deploy && npm run test:db
 */
describe('money ledger in Postgres', () => {
  const prisma = new PrismaClient();
  let userId: string;
  let sub: Record<'mbankPln' | 'zenPln' | 'zenEur' | 'convPln' | 'convEur' | 'ibkrVwce', string>;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `money-${Date.now()}-${Math.random()}@test.local`, passwordHash: 'x' },
    });
    userId = user.id;
    const bank = await prisma.moneyInstitution.create({ data: { userId, name: 'mBank', kind: 'bank' } });
    const zen = await prisma.moneyInstitution.create({ data: { userId, name: 'ZEN', kind: 'bank' } });
    const ibkr = await prisma.moneyInstitution.create({ data: { userId, name: 'IBKR', kind: 'broker' } });
    const vwce = await prisma.moneyCommodity.create({
      data: { kind: 'asset', code: 'VWCE', name: 'Vanguard FTSE All-World', decimals: 4, userId },
    });
    const account = (institutionId: string | null, name: string, type: 'bank' | 'investment' | 'system') =>
      prisma.moneyAccount.create({
        data: { userId, institutionId, name, type, systemRole: type === 'system' ? 'conversion' : null },
      });
    const mbank = await account(bank.id, 'mBank', 'bank');
    const zenAcc = await account(zen.id, 'ZEN', 'bank');
    const ibkrAcc = await account(ibkr.id, 'IBKR', 'investment');
    const conversion = await account(null, 'Conversion', 'system');
    const subAccount = async (accountId: string, commodityId: string) =>
      (await prisma.moneySubAccount.create({ data: { accountId, commodityId } })).id;
    sub = {
      mbankPln: await subAccount(mbank.id, 'PLN'),
      zenPln: await subAccount(zenAcc.id, 'PLN'),
      zenEur: await subAccount(zenAcc.id, 'EUR'),
      convPln: await subAccount(conversion.id, 'PLN'),
      convEur: await subAccount(conversion.id, 'EUR'),
      ibkrVwce: await subAccount(ibkrAcc.id, vwce.id),
    };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const post = (entries: { subAccountId: string; amountMinor?: bigint; quantity?: string }[]) =>
    prisma.moneyTransaction.create({
      data: {
        userId,
        date: new Date('2026-10-28'),
        kind: 'transfer',
        postedAt: new Date(),
        entries: { create: entries },
      },
      include: { entries: true },
    });

  const countTransactions = () => prisma.moneyTransaction.count({ where: { userId } });

  describe('currency seed (rule 6)', () => {
    it('has the ISO 4217 currencies with their minor units', async () => {
      const rows = await prisma.moneyCommodity.findMany({
        where: { kind: 'currency', id: { in: ['PLN', 'EUR', 'USD', 'GBP', 'CHF', 'JPY', 'KWD', 'HUF'] } },
      });
      const decimals = Object.fromEntries(rows.map((r) => [r.id, r.decimals]));
      expect(decimals).toEqual({ PLN: 2, EUR: 2, USD: 2, GBP: 2, CHF: 2, JPY: 0, KWD: 3, HUF: 2 });
      expect(await prisma.moneyCommodity.count({ where: { kind: 'currency' } })).toBeGreaterThanOrEqual(150);
    });
  });

  describe('double entry (rules 2 and 3)', () => {
    it('commits a balanced same-currency transfer', async () => {
      const tx = await post([
        { subAccountId: sub.mbankPln, amountMinor: -50000n },
        { subAccountId: sub.zenPln, amountMinor: 50000n },
      ]);
      expect(tx.entries.map((e) => e.amountMinor)).toEqual([-50000n, 50000n]);
    });

    it('commits a cross-currency transfer through the conversion account', async () => {
      await expect(
        post([
          { subAccountId: sub.mbankPln, amountMinor: -100000n },
          { subAccountId: sub.convPln, amountMinor: 100000n },
          { subAccountId: sub.convEur, amountMinor: -23000n },
          { subAccountId: sub.zenEur, amountMinor: 23000n },
        ]),
      ).resolves.toBeDefined();
    });

    it('rejects an unbalanced transaction at commit and keeps none of it', async () => {
      const before = await countTransactions();
      await expect(
        post([
          { subAccountId: sub.mbankPln, amountMinor: -50000n },
          { subAccountId: sub.zenPln, amountMinor: 49999n },
        ]),
      ).rejects.toThrow(/does not balance in PLN/);
      expect(await countTransactions()).toBe(before);
    });

    it('rejects a cross-currency transfer that skips the conversion account', async () => {
      await expect(
        post([
          { subAccountId: sub.mbankPln, amountMinor: -100000n },
          { subAccountId: sub.zenEur, amountMinor: 23000n },
        ]),
      ).rejects.toThrow(/does not balance/);
    });

    it('rolls back every write of an interactive transaction when one part fails', async () => {
      const before = await countTransactions();
      await expect(
        prisma.$transaction(async (db) => {
          await db.moneyTransaction.create({
            data: {
              userId,
              date: new Date('2026-10-28'),
              kind: 'transfer',
              entries: {
                create: [
                  { subAccountId: sub.mbankPln, amountMinor: -100n },
                  { subAccountId: sub.zenPln, amountMinor: 100n },
                ],
              },
            },
          });
          throw new Error('second leg failed');
        }),
      ).rejects.toThrow('second leg failed');
      expect(await countTransactions()).toBe(before);
    });

    it('rejects an entry whose amount column does not match the commodity', async () => {
      await expect(
        post([
          { subAccountId: sub.ibkrVwce, amountMinor: 100n },
          { subAccountId: sub.mbankPln, amountMinor: -100n },
        ]),
      ).rejects.toThrow(/does not match the asset sub-account/);
    });

    it('stores asset quantities with 10 decimal places', async () => {
      const tx = await post([
        { subAccountId: sub.ibkrVwce, quantity: quantityToDb(parseQuantity('0.1234567891')) },
        { subAccountId: sub.ibkrVwce, quantity: quantityToDb(-parseQuantity('0.1234567891')) },
      ]);
      expect(tx.entries[0].quantity?.toFixed(10)).toBe('0.1234567891');
    });
  });

  describe('posted transactions never change (rule 4)', () => {
    it('refuses to update or delete a posted entry', async () => {
      const tx = await post([
        { subAccountId: sub.mbankPln, amountMinor: -700n },
        { subAccountId: sub.zenPln, amountMinor: 700n },
      ]);
      await expect(
        prisma.moneyEntry.update({ where: { id: tx.entries[0].id }, data: { amountMinor: -800n } }),
      ).rejects.toThrow(/immutable/);
      await expect(prisma.moneyEntry.delete({ where: { id: tx.entries[0].id } })).rejects.toThrow(/immutable/);
    });

    it('refuses to update or delete a posted transaction', async () => {
      const tx = await post([
        { subAccountId: sub.mbankPln, amountMinor: -300n },
        { subAccountId: sub.zenPln, amountMinor: 300n },
      ]);
      await expect(prisma.moneyTransaction.update({ where: { id: tx.id }, data: { note: 'edit' } })).rejects.toThrow(
        /immutable/,
      );
      await expect(prisma.moneyTransaction.delete({ where: { id: tx.id } })).rejects.toThrow(/immutable/);
    });

    it('refuses new entries on a transaction posted earlier', async () => {
      const tx = await post([
        { subAccountId: sub.mbankPln, amountMinor: -300n },
        { subAccountId: sub.zenPln, amountMinor: 300n },
      ]);
      await expect(
        prisma.moneyEntry.createMany({
          data: [
            { transactionId: tx.id, subAccountId: sub.mbankPln, amountMinor: -1n },
            { transactionId: tx.id, subAccountId: sub.zenPln, amountMinor: 1n },
          ],
        }),
      ).rejects.toThrow(/immutable/);
    });

    it('refuses new entries after a later update of the row, even one that changes nothing', async () => {
      const tx = await post([
        { subAccountId: sub.mbankPln, amountMinor: -400n },
        { subAccountId: sub.zenPln, amountMinor: 400n },
      ]);
      const more = (db: Pick<PrismaClient, 'moneyEntry'>) =>
        db.moneyEntry.createMany({
          data: [
            { transactionId: tx.id, subAccountId: sub.mbankPln, amountMinor: -1n },
            { transactionId: tx.id, subAccountId: sub.zenPln, amountMinor: 1n },
          ],
        });
      // the link columns may change (a deleted recurring rule sets them to NULL); that is no licence to add entries
      await expect(
        prisma.$transaction(async (db) => {
          await db.moneyTransaction.update({ where: { id: tx.id }, data: { recurringRuleId: null } });
          await more(db);
        }),
      ).rejects.toThrow(/immutable/);
      // nor is writing the posting transaction's id by hand
      await expect(
        prisma.$transaction(async (db) => {
          await db.$executeRaw`UPDATE "money_transaction" SET "postedXact" = pg_current_xact_id()::text::bigint WHERE "id" = ${tx.id}`;
          await more(db);
        }),
      ).rejects.toThrow(/immutable/);
      expect(await prisma.moneyEntry.count({ where: { transactionId: tx.id } })).toBe(2);
    });

    it('refuses zero entries', async () => {
      await expect(
        post([
          { subAccountId: sub.mbankPln, amountMinor: 0n },
          { subAccountId: sub.zenPln, amountMinor: 0n },
        ]),
      ).rejects.toThrow(/money_entry_nonzero/);
      await expect(
        post([
          { subAccountId: sub.ibkrVwce, quantity: '0' },
          { subAccountId: sub.ibkrVwce, quantity: '0' },
        ]),
      ).rejects.toThrow(/money_entry_nonzero/);
    });

    it('lets a correction point at the original', async () => {
      const original = await post([
        { subAccountId: sub.mbankPln, amountMinor: -1000n },
        { subAccountId: sub.zenPln, amountMinor: 1000n },
      ]);
      const reversal = await prisma.moneyTransaction.create({
        data: {
          userId,
          date: new Date('2026-10-29'),
          kind: 'correction',
          correctsId: original.id,
          postedAt: new Date(),
          entries: {
            create: [
              { subAccountId: sub.mbankPln, amountMinor: 1000n },
              { subAccountId: sub.zenPln, amountMinor: -1000n },
            ],
          },
        },
      });
      expect(reversal.correctsId).toBe(original.id);
    });

    it('keeps drafts free of entries until the database transaction that posts them', async () => {
      const draft = await prisma.moneyTransaction.create({
        data: {
          userId,
          date: new Date('2026-10-28'),
          kind: 'transfer',
          status: 'draft',
          draft: { kind: 'transfer', input: { amount: '1.00' } },
        },
      });
      await expect(
        prisma.moneyEntry.createMany({
          data: [
            { transactionId: draft.id, subAccountId: sub.mbankPln, amountMinor: -100n },
            { transactionId: draft.id, subAccountId: sub.zenPln, amountMinor: 100n },
          ],
        }),
      ).rejects.toThrow(/posted transactions only/);

      await prisma.moneyTransaction.update({ where: { id: draft.id }, data: { note: 'edited while a draft' } });
      await prisma.$transaction(async (db) => {
        await db.moneyTransaction.update({ where: { id: draft.id }, data: { status: 'posted', postedAt: new Date() } });
        await db.moneyEntry.createMany({
          data: [
            { transactionId: draft.id, subAccountId: sub.mbankPln, amountMinor: -100n },
            { transactionId: draft.id, subAccountId: sub.zenPln, amountMinor: 100n },
          ],
        });
      });
      await expect(prisma.moneyTransaction.update({ where: { id: draft.id }, data: { note: 'x' } })).rejects.toThrow(
        /immutable/,
      );
    });

    it('refuses a draft without its proposal and a posted transaction without entries', async () => {
      await expect(
        prisma.moneyTransaction.create({
          data: { userId, date: new Date('2026-10-28'), kind: 'transfer', status: 'draft' },
        }),
      ).rejects.toThrow(/has no proposal/);
      await expect(
        prisma.moneyTransaction.create({ data: { userId, date: new Date('2026-10-28'), kind: 'transfer' } }),
      ).rejects.toThrow(/fewer than two entries/);
    });

    it('lets a draft be dropped', async () => {
      const draft = await prisma.moneyTransaction.create({
        data: { userId, date: new Date('2026-10-28'), kind: 'expense', status: 'draft', draft: { kind: 'expense' } },
      });
      await prisma.moneyTransaction.delete({ where: { id: draft.id } });
      expect(await prisma.moneyTransaction.findUnique({ where: { id: draft.id } })).toBeNull();
    });
  });

  it('removes the whole ledger only together with its user', async () => {
    const other = await prisma.user.create({ data: { email: `money-del-${Date.now()}@test.local`, passwordHash: 'x' } });
    const acc = await prisma.moneyAccount.create({ data: { userId: other.id, name: 'Cash', type: 'bank' } });
    const a = await prisma.moneySubAccount.create({ data: { accountId: acc.id, commodityId: 'PLN' } });
    const b = await prisma.moneySubAccount.create({ data: { accountId: acc.id, commodityId: 'USD' } });
    const c = await prisma.moneySubAccount.create({ data: { accountId: acc.id, commodityId: 'EUR' } });
    await prisma.moneyTransaction.create({
      data: {
        userId: other.id,
        date: new Date('2026-10-28'),
        kind: 'transfer',
        postedAt: new Date(),
        entries: {
          create: [
            { subAccountId: a.id, amountMinor: -5n },
            { subAccountId: a.id, amountMinor: 5n },
            { subAccountId: b.id, amountMinor: 1n },
            { subAccountId: b.id, amountMinor: -1n },
            { subAccountId: c.id, amountMinor: 2n },
            { subAccountId: c.id, amountMinor: -2n },
          ],
        },
      },
    });
    await prisma.user.delete({ where: { id: other.id } });
    expect(await prisma.moneyTransaction.count({ where: { userId: other.id } })).toBe(0);
    expect(await prisma.moneySubAccount.count({ where: { accountId: acc.id } })).toBe(0);
  });
});
