import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MoneyCategory } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
import { WRITE_TX } from '../common/db';
import { AuditService } from '../ledger/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { CategoryResponse, CreateCategoryDto, UpdateCategoryDto } from './category.models';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, includeArchived = false): Promise<CategoryResponse[]> {
    await this.ledger.ensureSetup(userId);
    const rows = await this.prisma.moneyCategory.findMany({
      // a merged category is gone from every list; its history shows under the other one
      where: { userId, mergedIntoId: null, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return rows.map(categoryResponse);
  }

  async create(userId: string, dto: CreateCategoryDto, actor = 'user'): Promise<CategoryResponse> {
    await this.ledger.ensureSetup(userId);
    if (dto.parentId) {
      const parent = await this.categoryOf(userId, dto.parentId);
      if (parent.kind !== dto.kind) throw new BadRequestException('a subcategory has the kind of its parent');
    }
    return this.prisma.$transaction(async (db) => {
      const row = await db.moneyCategory.create({
        data: { userId, name: dto.name.trim(), kind: dto.kind, parentId: dto.parentId ?? null },
      });
      await this.audit.record(db, { userId, actor, action: 'category.create', subjectId: row.id, details: { name: row.name } });
      return categoryResponse(row);
    });
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto, actor = 'user'): Promise<CategoryResponse> {
    const category = await this.categoryOf(userId, id);
    if (dto.parentId) {
      if (dto.parentId === id) throw new BadRequestException('a category cannot be its own parent');
      const parent = await this.categoryOf(userId, dto.parentId);
      if (parent.kind !== category.kind) throw new BadRequestException('a subcategory has the kind of its parent');
      if (parent.parentId === id) throw new BadRequestException('that would make a loop');
    }
    return this.prisma.$transaction(async (db) => {
      const row = await db.moneyCategory.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          parentId: dto.parentId,
          archivedAt: dto.archived === undefined ? undefined : dto.archived ? new Date() : null,
          leftOutOfTotals: dto.leftOutOfTotals,
        },
      });
      await this.audit.record(db, { userId, actor, action: 'category.update', subjectId: id, details: { ...dto } });
      return categoryResponse(row);
    });
  }

  /**
   * Merges a category into another of the same kind: it leaves every list, its history shows and
   * counts under the other one, and a movement given it later books to the other one. Nothing
   * posted changes (rule 4): the category stays, pointing at the other. Its subcategories move to
   * the other one, and categories merged into it before follow it there.
   */
  async merge(userId: string, sourceId: string, intoId: string, actor = 'user'): Promise<CategoryResponse> {
    if (sourceId === intoId) throw new BadRequestException('a category cannot be merged into itself');
    const source = await this.categoryOf(userId, sourceId);
    const into = await this.categoryOf(userId, intoId);
    if (source.key) {
      throw new BadRequestException(`${source.name} is built in (the ledger books to it); merge the other category into it instead`);
    }
    if (source.kind !== into.kind) {
      throw new BadRequestException(`${source.name} is an ${source.kind} category and ${into.name} an ${into.kind} one; only the same kind merges`);
    }
    for (let parentId = into.parentId; parentId; ) {
      if (parentId === source.id) throw new BadRequestException(`${into.name} is ${source.name}'s own subcategory`);
      parentId = (await this.prisma.moneyCategory.findUnique({ where: { id: parentId } }))?.parentId ?? null;
    }
    return this.prisma.$transaction(async (db) => {
      await this.ledger.lock(db, userId);
      await db.moneyCategory.update({ where: { id: source.id }, data: { mergedIntoId: into.id } });
      await db.moneyCategory.updateMany({ where: { userId, mergedIntoId: source.id }, data: { mergedIntoId: into.id } });
      await db.moneyCategory.updateMany({ where: { userId, parentId: source.id }, data: { parentId: into.id } });
      await this.audit.record(db, { userId, actor, action: 'category.merge', subjectId: source.id, details: { into: into.id, name: source.name } });
      return categoryResponse(into);
    }, WRITE_TX);
  }

  /** A category in use (not merged into another), or 404. */
  async categoryOf(userId: string, id: string): Promise<MoneyCategory> {
    const row = await this.prisma.moneyCategory.findFirst({ where: { id, userId, mergedIntoId: null } });
    if (!row) throw new NotFoundException('category not found');
    return row;
  }

  /** A category by id, or the user's category with this name and kind (created when missing). */
  async resolveByName(userId: string, name: string, kind: 'income' | 'expense', parentName?: string): Promise<string> {
    let parentId: string | null = null;
    if (parentName) parentId = await this.resolveByName(userId, parentName, kind);
    const existing = await this.prisma.moneyCategory.findFirst({
      where: { userId, kind, parentId, name: { equals: name.trim(), mode: 'insensitive' } },
    });
    // a merged category's name still finds the category it went into
    if (existing) return existing.mergedIntoId ?? existing.id;
    return (await this.prisma.moneyCategory.create({ data: { userId, name: name.trim(), kind, parentId } })).id;
  }
}

export function categoryResponse(row: MoneyCategory): CategoryResponse {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    parentId: row.parentId,
    key: row.key,
    leftOutOfTotals: row.leftOutOfTotals,
    archived: row.archivedAt !== null,
  };
}
