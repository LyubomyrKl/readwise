import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { MoneyAccount, MoneyInstitution } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { amountJson, unitsJson } from '../common/amounts';
import { WRITE_TX } from '../common/db';
import { toDate, toMinor } from '../common/parse';
import { formatDate } from '../core/dates';
import { LedgerService } from '../ledger/ledger.service';
import { AuditService } from '../ledger/audit.service';
import { MovementsService } from '../movements/movements.service';
import { CommoditiesService } from '../reference/commodities.service';
import {
  AccountResponse,
  CreateAccountDto,
  CreateInstitutionDto,
  InstitutionResponse,
  SubAccountBalance,
  UpdateAccountDto,
  UpdateInstitutionDto,
} from './account.models';
import { BalancesService, type SubAccountTotal } from './balances.service';

type AccountRow = MoneyAccount & { institution: MoneyInstitution | null; subAccounts: { id: string; number: string | null }[] };
const ROW_INCLUDE = { institution: true, subAccounts: { select: { id: true, number: true } } } as const;

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly balances: BalancesService,
    private readonly commodities: CommoditiesService,
    private readonly audit: AuditService,
    private readonly movements: MovementsService,
  ) {}

  // ---- institutions -------------------------------------------------------------------

  async listInstitutions(userId: string): Promise<InstitutionResponse[]> {
    const rows = await this.prisma.moneyInstitution.findMany({ where: { userId }, orderBy: { name: 'asc' } });
    return rows.map(institutionResponse);
  }

  async createInstitution(userId: string, dto: CreateInstitutionDto, actor = 'user'): Promise<InstitutionResponse> {
    try {
      return await this.prisma.$transaction(async (db) => {
        const row = await db.moneyInstitution.create({ data: { userId, name: dto.name.trim(), kind: dto.kind } });
        await this.audit.record(db, { userId, actor, action: 'institution.create', subjectId: row.id });
        return institutionResponse(row);
      });
    } catch (error) {
      throw uniqueToConflict(error, `an institution named ${dto.name} already exists`);
    }
  }

  async updateInstitution(userId: string, id: string, dto: UpdateInstitutionDto, actor = 'user') {
    await this.institutionOf(userId, id);
    try {
      return await this.prisma.$transaction(async (db) => {
        const row = await db.moneyInstitution.update({
          where: { id },
          data: { name: dto.name?.trim(), kind: dto.kind },
        });
        await this.audit.record(db, { userId, actor, action: 'institution.update', subjectId: id, details: { ...dto } });
        return institutionResponse(row);
      });
    } catch (error) {
      throw uniqueToConflict(error, `an institution named ${dto.name} already exists`);
    }
  }

  // ---- accounts -----------------------------------------------------------------------

  async list(userId: string, opts: { includeArchived?: boolean; asOf?: Date } = {}): Promise<AccountResponse[]> {
    await this.ledger.ensureSetup(userId);
    const accounts = await this.prisma.moneyAccount.findMany({
      where: { userId, type: { not: 'system' }, ...(opts.includeArchived ? {} : { archivedAt: null }) },
      include: ROW_INCLUDE,
      orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    });
    const totals = await this.balances.subAccountTotals(userId, { asOf: opts.asOf });
    return Promise.all(accounts.map((a) => this.toResponse(userId, a, totals)));
  }

  async get(userId: string, id: string, asOf?: Date): Promise<AccountResponse> {
    const account = await this.prisma.moneyAccount.findFirst({
      where: { id, userId, type: { not: 'system' } },
      include: ROW_INCLUDE,
    });
    if (!account) throw new NotFoundException('account not found');
    const totals = await this.balances.subAccountTotals(userId, { asOf, accountIds: [id] });
    return this.toResponse(userId, account, totals);
  }

  async create(userId: string, dto: CreateAccountDto, actor = 'user'): Promise<AccountResponse> {
    await this.ledger.ensureSetup(userId);
    if (dto.institutionId) await this.institutionOf(userId, dto.institutionId);
    if (dto.cashClassId) await this.classOf(userId, dto.cashClassId);
    const currencies = [...new Set(dto.currencies.map((c) => c.toUpperCase()))];
    for (const code of currencies) await this.commodities.currency(code);
    const openings: { currency: string; amount: bigint; value: string; date: Date }[] = [];
    for (const ob of dto.openingBalances ?? []) {
      const currency = await this.commodities.currency(ob.currency);
      if (!currencies.includes(currency.id)) currencies.push(currency.id);
      openings.push({
        currency: currency.id,
        amount: toMinor(ob.amount, currency.decimals, 'openingBalances.amount'),
        value: ob.amount,
        date: toDate(ob.date, 'openingBalances.date'),
      });
    }
    const numbers = new Map<string, string>();
    for (const n of dto.numbers ?? []) {
      const code = n.currency.toUpperCase();
      if (!currencies.includes(code)) throw new BadRequestException(`numbers: ${code} is not one of the account's currencies`);
      if (n.number.trim()) numbers.set(code, n.number.trim());
    }
    if (dto.type === 'debt' && openings.some((o) => o.amount > 0n)) {
      throw new BadRequestException('a debt opens with a negative balance (the amount owed, with a minus)');
    }

    const id = await this.prisma.$transaction(async (db) => {
      if (openings.length > 0) await this.ledger.lock(db, userId);
      const account = await db.moneyAccount.create({
        data: {
          userId,
          institutionId: dto.institutionId ?? null,
          name: dto.name.trim(),
          type: dto.type,
          taxWrapper: dto.taxWrapper ?? 'taxable',
          costBasisMethod: dto.costBasisMethod ?? null,
          cashClassId: dto.cashClassId ?? null,
          importProfile: dto.importProfile ?? null,
        },
      });
      for (const commodityId of currencies) {
        const number = numbers.get(commodityId) ?? null;
        await db.moneySubAccount.create({ data: { accountId: account.id, commodityId, number } });
      }
      await this.audit.record(db, {
        userId,
        actor,
        action: 'account.create',
        subjectId: account.id,
        details: { name: account.name, type: account.type, currencies },
      });
      for (const ob of openings) {
        if (ob.amount === 0n) continue;
        await this.movements.post(
          userId,
          { kind: 'opening_balance', input: { date: formatDate(ob.date), accountId: account.id, currency: ob.currency, amount: ob.value, note: 'Opening balance' } },
          { actor, db },
        );
      }
      return account.id;
    }, WRITE_TX);
    return this.get(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateAccountDto, actor = 'user'): Promise<AccountResponse> {
    const account = await this.accountOf(userId, id);
    if (dto.institutionId) await this.institutionOf(userId, dto.institutionId);
    if (dto.cashClassId) await this.classOf(userId, dto.cashClassId);
    if (dto.type && dto.type !== account.type && (dto.type === 'debt' || account.type === 'debt')) {
      throw new BadRequestException('an account cannot turn into a debt or back; open a new account');
    }
    await this.prisma.$transaction(async (db) => {
      await db.moneyAccount.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          institutionId: dto.institutionId,
          type: dto.type,
          taxWrapper: dto.taxWrapper,
          costBasisMethod: dto.costBasisMethod,
          cashClassId: dto.cashClassId,
          importProfile: dto.importProfile,
        },
      });
      await this.audit.record(db, { userId, actor, action: 'account.update', subjectId: id, details: { ...dto } });
    });
    return this.get(userId, id);
  }

  /** Archived accounts keep their history and balances; they leave the lists and take no new movements. */
  async setArchived(userId: string, id: string, archived: boolean, actor = 'user'): Promise<AccountResponse> {
    await this.accountOf(userId, id);
    await this.prisma.$transaction(async (db) => {
      await db.moneyAccount.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
      await this.audit.record(db, { userId, actor, action: archived ? 'account.archive' : 'account.unarchive', subjectId: id });
    });
    return this.get(userId, id);
  }

  async addCurrency(userId: string, id: string, code: string, actor = 'user'): Promise<AccountResponse> {
    const account = await this.accountOf(userId, id);
    if (account.archivedAt) throw new BadRequestException('the account is archived');
    const currency = await this.commodities.currency(code);
    await this.prisma.$transaction(async (db) => {
      await db.moneySubAccount.upsert({
        where: { accountId_commodityId: { accountId: id, commodityId: currency.id } },
        create: { accountId: id, commodityId: currency.id },
        update: {},
      });
      await this.audit.record(db, { userId, actor, action: 'account.add_currency', subjectId: id, details: { currency: currency.id } });
    });
    return this.get(userId, id);
  }

  /**
   * Merges `sourceId` into `intoId` (mBank USD becomes the USD of mBank): the
   * source's currencies move over with every entry, the emptied source goes.
   * No posted transaction changes; only which account a currency belongs to.
   * Refused across types, for a currency both hold, and for accounts holding units.
   */
  async merge(userId: string, sourceId: string, intoId: string, opts: { name?: string }, actor = 'user'): Promise<AccountResponse> {
    if (sourceId === intoId) throw new BadRequestException('an account cannot be merged into itself');
    await this.ledger.ensureSetup(userId);
    await this.prisma.$transaction(async (db) => {
      await this.ledger.lock(db, userId);
      const load = (id: string) =>
        db.moneyAccount.findFirst({ where: { id, userId, type: { not: 'system' } }, include: { subAccounts: { include: { commodity: true } } } });
      const [source, into] = [await load(sourceId), await load(intoId)];
      if (!source || !into) throw new NotFoundException('account not found');
      if (source.type !== into.type) throw new BadRequestException(`${source.name} is ${source.type} and ${into.name} is ${into.type}; only accounts of the same type merge`);
      const shared = source.subAccounts.filter((s) => into.subAccounts.some((t) => t.commodityId === s.commodityId));
      if (shared.length > 0) throw new BadRequestException(`${source.name} and ${into.name} both hold ${shared.map((s) => s.commodity.code).join(', ')}`);
      if (source.subAccounts.some((s) => s.commodity.kind === 'asset') || (await db.moneyLot.count({ where: { accountId: sourceId } })) > 0) {
        throw new BadRequestException(`${source.name} holds units; move them with a unit move first`);
      }
      await db.moneySubAccount.updateMany({ where: { accountId: sourceId }, data: { accountId: intoId } });
      await db.moneyImportBatch.updateMany({ where: { accountId: sourceId }, data: { accountId: intoId } });
      if (opts.name?.trim()) await db.moneyAccount.update({ where: { id: intoId }, data: { name: opts.name.trim() } });
      await db.moneyAccount.delete({ where: { id: sourceId } });
      await this.audit.record(db, {
        userId,
        actor,
        action: 'account.merge',
        subjectId: intoId,
        details: { from: sourceId, fromName: source.name, currencies: source.subAccounts.map((s) => s.commodity.code), name: opts.name?.trim() || into.name },
      });
    }, WRITE_TX);
    return this.get(userId, intoId);
  }

  /** The IBAN or account number of one currency of the account. */
  async setNumber(userId: string, id: string, code: string, number: string | null | undefined, actor = 'user'): Promise<AccountResponse> {
    await this.accountOf(userId, id);
    const currency = await this.commodities.currency(code);
    const sub = await this.prisma.moneySubAccount.findUnique({ where: { accountId_commodityId: { accountId: id, commodityId: currency.id } } });
    if (!sub) throw new NotFoundException(`the account has no ${currency.id} sub-account`);
    const value = number?.trim() || null;
    await this.prisma.$transaction(async (db) => {
      await db.moneySubAccount.update({ where: { id: sub.id }, data: { number: value } });
      await this.audit.record(db, { userId, actor, action: 'account.set_number', subjectId: id, details: { currency: currency.id, number: value } });
    });
    return this.get(userId, id);
  }

  async accountOf(userId: string, id: string): Promise<MoneyAccount> {
    const account = await this.prisma.moneyAccount.findFirst({ where: { id, userId, type: { not: 'system' } } });
    if (!account) throw new NotFoundException('account not found');
    return account;
  }

  private async institutionOf(userId: string, id: string): Promise<MoneyInstitution> {
    const row = await this.prisma.moneyInstitution.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('institution not found');
    return row;
  }

  private async classOf(userId: string, id: string) {
    const row = await this.prisma.moneyAssetClass.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('asset class not found');
    return row;
  }

  private async toResponse(userId: string, account: AccountRow, totals: SubAccountTotal[]): Promise<AccountResponse> {
    const mine = totals.filter((t) => t.accountId === account.id);
    const commodities = await this.commodities.many(this.prisma, userId, mine.map((t) => t.commodityId));
    const balances: SubAccountBalance[] = mine
      .map((t) => {
        const c = commodities.get(t.commodityId)!;
        return {
          subAccountId: t.subAccountId,
          commodityId: t.commodityId,
          code: c.code,
          kind: c.kind,
          balance: c.kind === 'currency' ? amountJson(t.minor, c.id, c.decimals) : null,
          units: c.kind === 'asset' ? unitsJson(t.units) : null,
          number: account.subAccounts.find((s) => s.id === t.subAccountId)?.number ?? null,
        };
      })
      .sort((a, b) => (a.kind === b.kind ? a.code.localeCompare(b.code) : a.kind === 'currency' ? -1 : 1));
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      institution: account.institution ? institutionResponse(account.institution) : null,
      taxWrapper: account.taxWrapper,
      costBasisMethod: account.costBasisMethod,
      cashClassId: account.cashClassId,
      importProfile: account.importProfile,
      archivedAt: account.archivedAt?.toISOString() ?? null,
      balances,
    };
  }
}

function institutionResponse(row: MoneyInstitution): InstitutionResponse {
  return { id: row.id, name: row.name, kind: row.kind };
}

function uniqueToConflict(error: unknown, message: string): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ConflictException(message);
  }
  return error instanceof Error ? error : new Error(String(error));
}
