import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type MoneyImportBatch, type MoneyImportRowStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { EnvironmentVariables } from '@platform/config/env.validation';
import { PrismaService } from '@platform/db/prisma.service';
import { BalancesService } from '../accounts/balances.service';
import { AccountsService } from '../accounts/accounts.service';
import { amountJson } from '../common/amounts';
import { BULK_TX, type Db } from '../common/db';
import { decodeBytes, parseCsv } from '../core/csv';
import { addDays, daysBetween, formatDate, parseDate, todayIn } from '../core/dates';
import { addDecimals } from '../core/decimal';
import { guessColumns } from '../core/import-parse';
import { parseMinor } from '../core/money';
import { DEFAULT_TYPE_VALUES, distinctValues, type MoneyManagerMapping } from '../core/money-manager';
import { AuditService } from '../ledger/audit.service';
import { jsonInput, LedgerService } from '../ledger/ledger.service';
import { MovementsService } from '../movements/movements.service';
import { CommoditiesService } from '../reference/commodities.service';
import {
  IBKR_PROFILE,
  MBANK_PROFILE,
  MONEY_MANAGER_PROFILE,
  PKO_PROFILE,
  ZEN_PROFILE,
  type ImportProfile,
  type ImportProposal,
  type ProfileRow,
} from './import-profile';
import {
  BalancePreview,
  BalanceTargetDto,
  CommitResult,
  CreateAccountsDto,
  ImportBatchResponse,
  ImportRowPage,
  ImportRowsQuery,
  MappingDto,
} from './import.models';

const MAX_FILE_ROWS = 50_000;
const MATCH_WINDOW_DAYS = 3;
const HEAD_LINES = 12;

interface Effect {
  accountId: string;
  currency: string;
  minor: bigint;
  date: string;
}

interface BatchOptions {
  targets?: BalanceTargetDto[];
}

/**
 * Imports: a file becomes a batch of rows; a profile maps rows to movements
 * (proposals); rows already imported (same fingerprint) or already in the
 * ledger (same account, amount, nearby day) are held back; commit posts the
 * rest and the opening balances that make every account end where the bank
 * says, in one database transaction.
 */
@Injectable()
export class ImportsService {
  private readonly profiles = new Map<string, ImportProfile>();
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly movements: MovementsService,
    private readonly commodities: CommoditiesService,
    private readonly balances: BalancesService,
    private readonly accounts: AccountsService,
    private readonly audit: AuditService,
    config: ConfigService<EnvironmentVariables>,
  ) {
    this.timeZone = config.get('MONEY_TIMEZONE', { infer: true }) ?? 'Europe/Warsaw';
    for (const profile of [MONEY_MANAGER_PROFILE, MBANK_PROFILE, PKO_PROFILE, ZEN_PROFILE, IBKR_PROFILE]) this.register(profile);
  }

  register(profile: ImportProfile): void {
    this.profiles.set(profile.id, profile);
  }

  listProfiles() {
    return [...this.profiles.values()].map(({ id, label, needsAccount, needsMapping }) => ({ id, label, needsAccount, needsMapping }));
  }

  private profile(id: string): ImportProfile {
    const profile = this.profiles.get(id);
    if (!profile) throw new BadRequestException(`unknown import profile: ${id}`);
    return profile;
  }

  // ---- batches --------------------------------------------------------------------------

  async upload(
    userId: string,
    file: { buffer: Buffer; originalname: string } | undefined,
    opts: { profile: string; accountId?: string },
  ): Promise<ImportBatchResponse> {
    if (!file?.buffer?.length) throw new BadRequestException('attach the file');
    const profile = this.profile(opts.profile);
    if (profile.needsAccount && !opts.accountId) throw new BadRequestException('pick the account this statement belongs to');
    if (opts.accountId) await this.accounts.accountOf(userId, opts.accountId);
    await this.ledger.ensureSetup(userId);

    const sha = createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.prisma.moneyImportBatch.findUnique({ where: { userId_fileSha256: { userId, fileSha256: sha } } });
    if (existing) {
      if (existing.status === 'committed') {
        throw new ConflictException(`this file was imported on ${formatDate(existing.committedAt ?? existing.createdAt)}`);
      }
      return this.get(userId, existing.id);
    }

    const { text, encoding } = decodeBytes(new Uint8Array(file.buffer));
    const rows = parseCsv(text);
    if (rows.length === 0) throw new BadRequestException('the file holds no rows');
    if (rows.length > MAX_FILE_ROWS) throw new BadRequestException(`the file has more than ${MAX_FILE_ROWS} rows`);

    const batch = await this.prisma.$transaction(async (db) => {
      const created = await db.moneyImportBatch.create({
        data: {
          userId,
          sourceProfile: profile.id,
          accountId: opts.accountId ?? null,
          fileName: file.originalname.slice(0, 200),
          fileSha256: sha,
          encoding,
          rowCount: rows.length,
        },
      });
      await db.moneyImportRow.createMany({
        data: rows.map((raw, i) => ({ batchId: created.id, rowNumber: i + 1, raw })),
      });
      await this.audit.record(db, { userId, actor: 'user', action: 'import.upload', subjectId: created.id, details: { file: created.fileName, rows: rows.length } });
      return created;
    }, BULK_TX);

    if (!profile.needsMapping) await this.remap(userId, batch.id, undefined);
    return this.get(userId, batch.id);
  }

  async list(userId: string): Promise<ImportBatchResponse[]> {
    const batches = await this.prisma.moneyImportBatch.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return Promise.all(batches.map((b) => this.present(b, false)));
  }

  async get(userId: string, id: string): Promise<ImportBatchResponse> {
    return this.present(await this.batchOf(userId, id), true);
  }

  async rows(userId: string, id: string, query: ImportRowsQuery): Promise<ImportRowPage> {
    await this.batchOf(userId, id);
    const where: Prisma.MoneyImportRowWhereInput = { batchId: id, ...(query.status ? { status: query.status as MoneyImportRowStatus } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.moneyImportRow.findMany({
        where,
        orderBy: { rowNumber: 'asc' },
        skip: Number(query.offset ?? 0),
        take: Math.min(Number(query.limit ?? 200), 1000),
        include: { transaction: { select: { id: true } } },
      }),
      this.prisma.moneyImportRow.count({ where }),
    ]);
    return {
      total,
      items: items.map((r) => ({
        id: r.id,
        rowNumber: r.rowNumber,
        raw: r.raw as string[],
        status: r.status,
        message: r.message,
        proposal: r.proposal,
        matchTransactionId: r.matchTransactionId,
        transactionId: r.transaction?.id ?? null,
      })),
    };
  }

  async remove(userId: string, id: string): Promise<{ removed: true }> {
    const batch = await this.batchOf(userId, id);
    if (batch.status === 'committed') throw new BadRequestException('a committed import stays; reverse its transactions instead');
    await this.prisma.moneyImportBatch.delete({ where: { id } });
    return { removed: true };
  }

  // ---- mapping and review ---------------------------------------------------------------

  async applyMapping(userId: string, id: string, dto: MappingDto): Promise<ImportBatchResponse> {
    const batch = await this.batchOf(userId, id);
    this.assertOpen(batch);
    const accountIds = [...new Set([...Object.values(dto.accounts), ...(dto.fixedAccountId ? [dto.fixedAccountId] : [])])];
    for (const accountId of accountIds) await this.accounts.accountOf(userId, accountId);
    await this.commodities.currency(dto.defaultCurrency);
    const mapping: MoneyManagerMapping = { ...dto, typeValues: { ...dto.typeValues }, columns: { ...dto.columns } };
    await this.remap(userId, id, mapping);
    return this.get(userId, id);
  }

  async setRowStatus(userId: string, id: string, rowId: string, status: 'ready' | 'skipped'): Promise<{ status: string }> {
    const batch = await this.batchOf(userId, id);
    this.assertOpen(batch);
    const row = await this.prisma.moneyImportRow.findFirst({ where: { id: rowId, batchId: id } });
    if (!row) throw new NotFoundException('row not found');
    if (!row.proposal) throw new BadRequestException(row.message ?? 'this row has nothing to import');
    if (status === 'ready' && (row.proposal as unknown as ImportProposal).matchOnly) {
      throw new BadRequestException('this is half of a transfer: record the transfer from the other account instead');
    }
    await this.prisma.moneyImportRow.update({ where: { id: rowId }, data: { status } });
    return { status };
  }

  /** What each account will hold after the import, and the opening balance that makes it match the bank. */
  async setTargets(userId: string, id: string, targets: BalanceTargetDto[]): Promise<BalancePreview[]> {
    const batch = await this.batchOf(userId, id);
    this.assertOpen(batch);
    for (const t of targets) {
      await this.accounts.accountOf(userId, t.accountId);
      const currency = await this.commodities.currency(t.currency);
      this.minor(t.balance, currency.decimals, 'balance');
      if (t.asOf) parseDate(t.asOf);
    }
    const options: BatchOptions = { ...(batch.options as BatchOptions | null), targets };
    await this.prisma.moneyImportBatch.update({ where: { id }, data: { options: jsonInput(options) } });
    return this.balancePreview(userId, id);
  }

  async balancePreview(userId: string, id: string, db: Db | PrismaService = this.prisma): Promise<BalancePreview[]> {
    const batch = await this.batchOf(userId, id);
    const targets = (batch.options as BatchOptions | null)?.targets ?? [];
    const effects = await this.effects(id, db);
    const keys = new Map<string, { accountId: string; currency: string }>();
    for (const e of effects) keys.set(`${e.accountId}/${e.currency}`, { accountId: e.accountId, currency: e.currency });
    for (const t of targets) keys.set(`${t.accountId}/${t.currency}`, { accountId: t.accountId, currency: t.currency });
    if (keys.size === 0) return [];

    const accountIds = [...new Set([...keys.values()].map((k) => k.accountId))];
    const accounts = await db.moneyAccount.findMany({ where: { id: { in: accountIds }, userId } });
    const totals = await this.balances.subAccountTotals(userId, { accountIds }, db);
    const firstEntries = await this.firstEntryDates(db, userId, accountIds);
    const today = formatDate(todayIn(this.timeZone));

    const out: BalancePreview[] = [];
    for (const { accountId, currency } of keys.values()) {
      const c = await this.commodities.currency(currency);
      const mine = effects.filter((e) => e.accountId === accountId && e.currency === currency);
      const before = totals.find((t) => t.accountId === accountId && t.commodityId === currency)?.minor ?? 0n;
      const change = mine.reduce((sum, e) => sum + e.minor, 0n);
      const target = targets.find((t) => t.accountId === accountId && t.currency === currency);
      let openingBalance: bigint | null = null;
      let openingDate: string | null = null;
      if (target) {
        const asOf = target.asOf ?? today;
        const beforeAsOf = (
          await this.balances.subAccountTotals(userId, { accountIds: [accountId], asOf: parseDate(asOf) }, db)
        ).find((t) => t.commodityId === currency)?.minor ?? 0n;
        const changeAsOf = mine.filter((e) => e.date <= asOf).reduce((sum, e) => sum + e.minor, 0n);
        openingBalance = this.minor(target.balance, c.decimals, 'balance') - (beforeAsOf + changeAsOf);
        const dates = [...mine.map((e) => e.date), ...(firstEntries.get(`${accountId}/${currency}`) ?? [])].sort();
        openingDate = formatDate(addDays(parseDate(dates[0] ?? asOf), -1));
      }
      out.push({
        accountId,
        accountName: accounts.find((a) => a.id === accountId)?.name ?? accountId,
        currency,
        before: amountJson(before, currency, c.decimals),
        change: amountJson(change, currency, c.decimals),
        after: amountJson(before + change, currency, c.decimals),
        target: target ? amountJson(this.minor(target.balance, c.decimals, 'balance'), currency, c.decimals) : null,
        asOf: target ? (target.asOf ?? today) : null,
        openingBalance: openingBalance === null ? null : amountJson(openingBalance, currency, c.decimals),
        openingDate,
      });
    }
    return out.sort((a, b) => a.accountName.localeCompare(b.accountName) || a.currency.localeCompare(b.currency));
  }

  /** Creates the accounts named in the file (with the currencies seen for them) and maps them. */
  async createAccounts(userId: string, id: string, dto: CreateAccountsDto): Promise<ImportBatchResponse> {
    const batch = await this.batchOf(userId, id);
    this.assertOpen(batch);
    const mapping = batch.mapping as MoneyManagerMapping | null;
    if (!mapping) throw new BadRequestException('map the columns first');
    const rows = await this.rawRows(id);
    const institutionName = dto.institutionName?.trim() || 'Imported';
    const institution =
      (await this.prisma.moneyInstitution.findFirst({ where: { userId, name: institutionName } })) ??
      (await this.accounts.createInstitution(userId, { name: institutionName, kind: 'bank' }));
    const accounts = { ...mapping.accounts };
    for (const name of dto.names) {
      if (accounts[name]) continue;
      const currencies = new Set<string>();
      for (const row of rows.slice(mapping.headerRow + 1)) {
        const cur = (i: number | undefined) => (i === undefined ? '' : (row[i] ?? '').trim().toUpperCase());
        if ((row[mapping.columns.account ?? -1] ?? '').trim() === name) currencies.add(cur(mapping.columns.currency) || mapping.defaultCurrency);
        if ((row[mapping.columns.toAccount ?? -1] ?? '').trim() === name) {
          currencies.add(cur(mapping.columns.toCurrency) || cur(mapping.columns.currency) || mapping.defaultCurrency);
        }
      }
      const valid: string[] = [];
      for (const code of currencies) if (await this.commodities.isCurrency(code)) valid.push(code);
      const created = await this.accounts.create(userId, {
        institutionId: institution.id,
        name: name.slice(0, 80),
        type: 'bank',
        currencies: valid.length > 0 ? valid : [mapping.defaultCurrency],
      });
      accounts[name] = created.id;
    }
    await this.remap(userId, id, { ...mapping, accounts });
    return this.get(userId, id);
  }

  // ---- commit ---------------------------------------------------------------------------

  async commit(userId: string, id: string): Promise<CommitResult> {
    const batch = await this.batchOf(userId, id);
    this.assertOpen(batch);
    await this.ledger.ensureSetup(userId);
    const actor = `import:${id}`;
    return this.prisma.$transaction(async (db) => {
      await this.ledger.lock(db, userId);
      // committed meanwhile by another request?
      this.assertOpen(await db.moneyImportBatch.findUniqueOrThrow({ where: { id } }));
      // opening balances from the ledger as it is before this import
      const previews = (await this.balancePreview(userId, id, db)).filter((p) => p.openingBalance && p.openingBalance.minor !== '0');

      const rows = await db.moneyImportRow.findMany({ where: { batchId: id, status: 'ready' } });
      const ordered = rows
        .map((r) => ({ row: r, proposal: r.proposal as unknown as ImportProposal }))
        .sort((a, b) => (a.proposal.input.date ?? '').localeCompare(b.proposal.input.date ?? '') || a.row.rowNumber - b.row.rowNumber);

      const categoryIds = new Map<string, string>();
      let categoriesCreated = 0;
      const resolveCategory = async (ref: NonNullable<ImportProposal['category']>): Promise<string> => {
        const key = JSON.stringify(ref);
        const cached = categoryIds.get(key);
        if (cached) return cached;
        let parentId: string | null = null;
        if (ref.parent) parentId = await resolveCategory({ name: ref.parent, kind: ref.kind });
        let category = await db.moneyCategory.findFirst({
          where: { userId, kind: ref.kind, parentId, name: { equals: ref.name, mode: 'insensitive' } },
        });
        if (!category) {
          category = await db.moneyCategory.create({ data: { userId, name: ref.name.slice(0, 60), kind: ref.kind, parentId } });
          categoriesCreated++;
        }
        categoryIds.set(key, category.id);
        return category.id;
      };
      const assetIds = new Map<string, string>();
      const resolveAsset = async (ref: NonNullable<ImportProposal['asset']>): Promise<string> => {
        const key = ref.ticker.toUpperCase();
        const cached = assetIds.get(key);
        if (cached) return cached;
        const found = await db.moneyAsset.findFirst({
          where: {
            OR: [
              ...(ref.isin ? [{ isin: { equals: ref.isin, mode: 'insensitive' as const } }] : []),
              { ticker: { equals: ref.ticker, mode: 'insensitive' } },
              { commodity: { code: { equals: ref.ticker, mode: 'insensitive' } } },
            ],
            commodity: { userId },
          },
        });
        let assetId = found?.commodityId;
        if (!assetId) {
          const commodity = await db.moneyCommodity.create({
            data: { kind: 'asset', code: ref.ticker.toUpperCase(), name: (ref.name ?? ref.ticker).slice(0, 120), decimals: 4, userId },
          });
          await db.moneyAsset.create({
            data: { commodityId: commodity.id, ticker: ref.ticker, isin: ref.isin ?? null, quoteCurrencyId: (await this.commodities.currency(ref.currency)).id },
          });
          assetId = commodity.id;
        }
        assetIds.set(key, assetId);
        return assetId;
      };

      let imported = 0;
      for (const { row, proposal } of ordered) {
        const input: Record<string, unknown> = { ...proposal.input };
        if (proposal.category) {
          const categoryId = await resolveCategory(proposal.category);
          if (proposal.kind === 'investment_income') input.incomeCategoryId = categoryId;
          else input.categoryId = categoryId;
        }
        if (proposal.asset) input.assetId = await resolveAsset(proposal.asset);
        try {
          await this.movements.post(userId, { kind: proposal.kind, input }, { actor, db, importRowId: row.id });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new BadRequestException(`row ${row.rowNumber}: ${message}`);
        }
        await db.moneyImportRow.update({ where: { id: row.id }, data: { status: 'imported' } });
        imported++;
      }

      for (const p of previews) {
        const input = { date: p.openingDate!, accountId: p.accountId, currency: p.currency, amount: p.openingBalance!.value, note: `Opening balance (import of ${batch.fileName})` };
        await this.movements.post(userId, { kind: 'opening_balance', input }, { actor, db });
      }

      await db.moneyImportBatch.update({ where: { id }, data: { status: 'committed', committedAt: new Date() } });
      await this.audit.record(db, {
        userId,
        actor: 'user',
        action: 'import.commit',
        subjectId: id,
        details: { imported, openingBalances: previews.length, categoriesCreated },
      });
      return { imported, openingBalances: previews.length, categoriesCreated };
    }, BULK_TX);
  }

  // ---- internals ------------------------------------------------------------------------

  private async batchOf(userId: string, id: string): Promise<MoneyImportBatch> {
    const batch = await this.prisma.moneyImportBatch.findFirst({ where: { id, userId } });
    if (!batch) throw new NotFoundException('import not found');
    return batch;
  }

  private assertOpen(batch: MoneyImportBatch): void {
    if (batch.status === 'committed') throw new BadRequestException('this import is committed');
  }

  private async rawRows(batchId: string): Promise<string[][]> {
    const rows = await this.prisma.moneyImportRow.findMany({
      where: { batchId },
      orderBy: { rowNumber: 'asc' },
      select: { raw: true },
    });
    return rows.map((r) => r.raw as string[]);
  }

  /** Runs the profile over the raw rows and stores what each row becomes. */
  private async remap(userId: string, batchId: string, mapping: MoneyManagerMapping | undefined): Promise<void> {
    const batch = await this.batchOf(userId, batchId);
    const profile = this.profile(batch.sourceProfile);
    const raw = await this.rawRows(batchId);
    const account = batch.accountId
      ? await this.prisma.moneyAccount.findFirst({ where: { id: batch.accountId, userId }, include: { subAccounts: true } })
      : null;
    // every numbered currency of your accounts, to recognise transfers between them
    const ownAccounts = (
      await this.prisma.moneySubAccount.findMany({
        where: { number: { not: null }, account: { userId, type: { not: 'system' } } },
        select: { accountId: true, number: true },
      })
    ).map((s) => ({ id: s.accountId, number: s.number }));
    const decimals = new Map((await this.commodities.list()).map((c) => [c.code, c.decimals]));
    const mapped = profile.map({
      rows: raw,
      mapping,
      account: account ? { id: account.id, currencies: account.subAccounts.map((s) => s.commodityId) } : undefined,
      ownAccounts,
      decimalsOf: (code) => decimals.get(code),
    });
    const byRow = new Map(mapped.map((m) => [m.rowNumber, m]));
    await this.holdBackKnown(userId, batchId, mapped);

    await this.prisma.$transaction(async (db) => {
      await db.moneyImportRow.deleteMany({ where: { batchId } });
      await db.moneyImportRow.createMany({
        data: raw.map((cells, i) => {
          const m = byRow.get(i + 1);
          return {
            batchId,
            rowNumber: i + 1,
            raw: cells,
            status: m?.status ?? 'skipped',
            message: m?.message ?? (m ? null : 'not a movement (header or summary line)'),
            proposal: m?.proposal ? jsonInput(m.proposal) : undefined,
            dedupeHash: m?.dedupeHash ?? null,
            matchTransactionId: m?.matchTransactionId ?? null,
          };
        }),
      });
      await db.moneyImportBatch.update({
        where: { id: batchId },
        data: { mapping: mapping ? jsonInput(mapping) : undefined },
      });
    }, BULK_TX);
  }

  /**
   * Rows whose fingerprint was imported before become `duplicate`; rows that
   * look like a movement already in the ledger (same account, currency and
   * amount within three days) become `matched`. Both are skipped unless the
   * user includes them.
   */
  private async holdBackKnown(userId: string, batchId: string, rows: ProfileRow[]): Promise<void> {
    const ready = rows.filter((r) => r.status === 'ready' && r.proposal);
    const hashes = ready.flatMap((r) => (r.dedupeHash ? [r.dedupeHash] : []));
    if (hashes.length > 0) {
      const earlier = await this.prisma.moneyImportRow.findMany({
        where: { dedupeHash: { in: hashes }, status: 'imported', batch: { userId, id: { not: batchId } } },
        select: { dedupeHash: true, rowNumber: true, batch: { select: { fileName: true } } },
      });
      const known = new Map(earlier.map((e) => [e.dedupeHash!, e]));
      for (const r of ready) {
        const hit = r.dedupeHash ? known.get(r.dedupeHash) : undefined;
        if (hit) {
          r.status = 'duplicate';
          r.message = `already imported from ${hit.batch.fileName} (row ${hit.rowNumber})`;
        }
      }
    }

    // nearby movements already in the ledger; the halves of transfers are only ever matched
    const halves = rows.filter((r) => r.proposal?.matchOnly);
    const candidates = [...ready.filter((r) => r.status === 'ready'), ...halves]
      .map((r) => ({ row: r, leg: mainLeg(r.proposal!) }))
      .filter((c) => c.leg);
    if (candidates.length > 0) {
      const accountIds = [...new Set(candidates.map((c) => c.leg!.accountId))];
      const dates = candidates.map((c) => c.leg!.date).sort();
      const from = addDays(parseDate(dates[0]), -MATCH_WINDOW_DAYS);
      const to = addDays(parseDate(dates[dates.length - 1]), MATCH_WINDOW_DAYS);
      const existing = await this.prisma.moneyEntry.findMany({
        where: {
          amountMinor: { not: null },
          subAccount: { accountId: { in: accountIds } },
          transaction: { userId, status: 'posted', date: { gte: from, lte: to }, kind: { not: 'correction' }, correctedBy: { none: { kind: 'correction' } } },
        },
        include: { subAccount: true, transaction: { select: { id: true, date: true, note: true, kind: true } } },
      });
      const used = new Set<string>();
      for (const { row, leg } of candidates) {
        const currency = await this.commodities.currency(leg!.currency).catch(() => null);
        if (!currency) continue;
        let minor: bigint;
        try {
          minor = parseMinor(leg!.amount, currency.decimals) * (leg!.sign === '-' ? -1n : 1n);
        } catch {
          continue;
        }
        const hit = existing.find(
          (e) =>
            !used.has(e.id) &&
            e.subAccount.accountId === leg!.accountId &&
            e.subAccount.commodityId === currency.id &&
            e.amountMinor === minor &&
            Math.abs(daysBetween(e.transaction.date, parseDate(leg!.date))) <= MATCH_WINDOW_DAYS,
        );
        if (hit) {
          used.add(hit.id);
          row.status = 'matched';
          row.matchTransactionId = hit.transaction.id;
          row.message = `looks like ${formatDate(hit.transaction.date)} ${hit.transaction.note ?? hit.transaction.kind} already in the ledger`;
        }
      }
    }
  }

  /** Every own-account currency amount the ready rows will post, by sub-account and date. */
  private async effects(batchId: string, db: Db | PrismaService): Promise<Effect[]> {
    const rows = await db.moneyImportRow.findMany({ where: { batchId, status: 'ready' }, select: { proposal: true } });
    const out: Effect[] = [];
    for (const { proposal } of rows) {
      const p = proposal as unknown as ImportProposal;
      for (const e of proposalEffects(p)) {
        const c = await this.commodities.currency(e.currency).catch(() => null);
        if (!c) continue;
        try {
          out.push({ accountId: e.accountId, currency: c.id, minor: parseMinor(e.amount, c.decimals) * e.sign, date: p.input.date });
        } catch {
          // an unparsable amount is reported when the row is posted
        }
      }
    }
    return out;
  }

  /** The day of the first posted entry of each account and currency (Postgres finds it; Prisma's distinct would read every entry). */
  private async firstEntryDates(db: Db | PrismaService, userId: string, accountIds: string[]): Promise<Map<string, string[]>> {
    if (accountIds.length === 0) return new Map();
    const rows = await db.$queryRaw<{ accountId: string; commodityId: string; first: string }[]>(Prisma.sql`
      SELECT s."accountId", s."commodityId", MIN(t."date")::text AS first
        FROM "money_entry" e
        JOIN "money_sub_account" s ON s."id" = e."subAccountId"
        JOIN "money_transaction" t ON t."id" = e."transactionId"
       WHERE t."userId" = ${userId} AND t."status" = 'posted' AND s."accountId" IN (${Prisma.join(accountIds)})
       GROUP BY s."accountId", s."commodityId"
    `);
    return new Map(rows.map((r) => [`${r.accountId}/${r.commodityId}`, [r.first]]));
  }

  private minor(value: string, decimals: number, field: string): bigint {
    try {
      return parseMinor(value, decimals);
    } catch (error) {
      throw new BadRequestException(`${field}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async present(batch: MoneyImportBatch, full: boolean): Promise<ImportBatchResponse> {
    const grouped = await this.prisma.moneyImportRow.groupBy({ by: ['status'], where: { batchId: batch.id }, _count: true });
    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count]));
    let head: string[][] = [];
    let accountNames: string[] = [];
    let typeValuesFound: string[] = [];
    let suggestedMapping: unknown = null;
    if (full) {
      const raw = await this.rawRows(batch.id);
      head = raw.slice(0, HEAD_LINES);
      const mapping = batch.mapping as MoneyManagerMapping | null;
      if (batch.sourceProfile === MONEY_MANAGER_PROFILE.id) {
        const headerRow = mapping?.headerRow ?? guessHeaderRow(raw);
        const columns = mapping?.columns ?? guessColumns(raw[headerRow] ?? []);
        accountNames = distinctValues(raw, headerRow, [columns.account, columns.toAccount]);
        typeValuesFound = columns.type === undefined ? [] : distinctValues(raw, headerRow, [columns.type]).slice(0, 50);
        if (!mapping) {
          const settings = await this.prisma.moneySettings.findUnique({ where: { userId: batch.userId } });
          suggestedMapping = {
            headerRow,
            columns: { ...columns, note: columns.note === undefined ? [] : [columns.note] },
            dateFormat: 'auto',
            decimalSeparator: 'auto',
            defaultCurrency: settings?.baseCurrencyId ?? 'PLN',
            amountSign: columns.type === undefined ? 'signed' : 'type',
            typeValues: DEFAULT_TYPE_VALUES,
            accounts: {},
          };
        }
      }
    }
    return {
      id: batch.id,
      profile: batch.sourceProfile,
      fileName: batch.fileName,
      accountId: batch.accountId,
      encoding: batch.encoding,
      status: batch.status,
      rowCount: batch.rowCount,
      counts,
      mapping: batch.mapping,
      suggestedMapping,
      accountNames,
      typeValuesFound,
      head,
      committedAt: batch.committedAt?.toISOString() ?? null,
      createdAt: batch.createdAt.toISOString(),
    };
  }
}

/** The first row that looks like a header: mostly non-numeric cells, at least three of them. */
export function guessHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = rows[i].filter((c) => c.trim());
    const texty = cells.filter((c) => !/^[-+\d\s.,:/()]+$/.test(c));
    if (cells.length >= 3 && texty.length >= Math.ceil(cells.length * 0.7)) return i;
  }
  return 0;
}

interface LegAmount {
  accountId: string;
  currency: string;
  amount: string;
  sign: 1n | -1n;
}

/** The own-account currency legs of a proposal, before categories and assets are resolved. */
export function proposalEffects(p: ImportProposal): LegAmount[] {
  const i = p.input;
  const signed = (accountId: string, currency: string, amount: string, positive: boolean): LegAmount => ({
    accountId,
    currency,
    amount,
    sign: positive ? 1n : -1n,
  });
  switch (p.kind) {
    case 'income':
      return [signed(i.accountId, i.currency, i.amount, true)];
    case 'expense':
    case 'fee':
      return [signed(i.accountId, i.currency, i.amount, false)];
    case 'opening_balance':
      return i.amount.startsWith('-')
        ? [signed(i.accountId, i.currency, i.amount.slice(1), false)]
        : [signed(i.accountId, i.currency, i.amount, true)];
    case 'transfer': {
      const out = signed(i.fromAccountId, i.fromCurrency, i.amountOut, false);
      const toCurrency = i.toCurrency ?? i.fromCurrency;
      if (toCurrency !== i.fromCurrency) return [out, signed(i.toAccountId, toCurrency, i.amountIn, true)];
      const received = i.fee ? addDecimals(i.amountOut, `-${i.fee}`) : i.amountOut;
      return [out, signed(i.toAccountId, toCurrency, received, true)];
    }
    case 'buy':
      return [signed(i.paidFromAccountId ?? i.accountId, i.currency, i.total, false)];
    case 'sell':
      return [signed(i.proceedsToAccountId ?? i.accountId, i.currency, i.proceeds, true)];
    case 'investment_income':
      return [signed(i.accountId, i.currency, i.amount, true)];
    default:
      return [];
  }
}

/** The leg duplicate matching compares: the movement as the account's statement shows it. */
function mainLeg(p: ImportProposal): { accountId: string; currency: string; amount: string; sign: '+' | '-'; date: string } | null {
  const legs = proposalEffects(p);
  // the statement's own side: half of a transfer leaves the other account blank
  const leg = legs.find((l) => l.accountId);
  if (!leg) return null;
  return { accountId: leg.accountId, currency: leg.currency, amount: leg.amount, sign: leg.sign < 0n ? '-' : '+', date: p.input.date };
}


