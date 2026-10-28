import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { MoneyAccount, MoneyInstitution } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { amountJson, unitsJson } from '../common/amounts';
import { WRITE_TX } from '../common/db';
import { toDate, toMinor } from '../common/parse';
import { openingBalanceLines } from '../core/postings';
import { asBadRequest, LedgerService } from '../ledger/ledger.service';
import { AuditService } from '../ledger/audit.service';
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

type AccountRow = MoneyAccount & { institution: MoneyInstitution | null };

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly balances: BalancesService,
    private readonly commodities: CommoditiesService,
    private readonly audit: AuditService,
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
      include: { institution: true },
      orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    });
    const totals = await this.balances.subAccountTotals(userId, { asOf: opts.asOf });
    return Promise.all(accounts.map((a) => this.toResponse(userId, a, totals)));
  }

  async get(userId: string, id: string, asOf?: Date): Promise<AccountResponse> {
    const account = await this.prisma.moneyAccount.findFirst({
      where: { id, userId, type: { not: 'system' } },
      include: { institution: true },
    });
    if (!account) throw new NotFoundException('account not found');
    const totals = await this.balances.subAccountTotals(userId, { asOf, accountIds: [id] });
    return this.toResponse(userId, account, totals);
  }

  async create(userId: string, dto: CreateAccountDto, actor = 'user'): Promise<AccountResponse> {
    await this.ledger.ensureSetup(userId);
    await this.institutionOf(userId, dto.institutionId);
    if (dto.cashClassId) await this.classOf(userId, dto.cashClassId);
    const currencies = [...new Set(dto.currencies.map((c) => c.toUpperCase()))];
    for (const code of currencies) await this.commodities.currency(code);
    const openings: { currency: string; amount: bigint; date: Date }[] = [];
    for (const ob of dto.openingBalances ?? []) {
      const currency = await this.commodities.currency(ob.currency);
      if (!currencies.includes(currency.id)) currencies.push(currency.id);
      openings.push({
        currency: currency.id,
        amount: toMinor(ob.amount, currency.decimals, 'openingBalances.amount'),
        date: toDate(ob.date, 'openingBalances.date'),
      });
    }
    if (dto.type === 'debt' && openings.some((o) => o.amount > 0n)) {
      throw new BadRequestException('a debt opens with a negative balance (the amount owed, with a minus)');
    }

    const id = await this.prisma.$transaction(async (db) => {
      const account = await db.moneyAccount.create({
        data: {
          userId,
          institutionId: dto.institutionId,
          name: dto.name.trim(),
          type: dto.type,
          taxWrapper: dto.taxWrapper ?? 'taxable',
          costBasisMethod: dto.costBasisMethod ?? null,
          cashClassId: dto.cashClassId ?? null,
          number: dto.number?.trim() || null,
          importProfile: dto.importProfile ?? null,
        },
      });
      for (const commodityId of currencies) {
        await db.moneySubAccount.create({ data: { accountId: account.id, commodityId } });
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
        try {
          await this.ledger.post(db, userId, openingBalanceLines({ accountId: account.id, currency: ob.currency, amount: ob.amount }), {
            actor,
            kind: 'opening_balance',
            date: ob.date,
            note: 'Opening balance',
          });
        } catch (error) {
          throw asBadRequest(error);
        }
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
          number: dto.number === undefined ? undefined : dto.number?.trim() || null,
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
      number: account.number,
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
