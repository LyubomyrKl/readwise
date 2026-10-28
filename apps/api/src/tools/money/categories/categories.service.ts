import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MoneyCategory } from '@prisma/client';
import { PrismaService } from '@platform/db/prisma.service';
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
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
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
        },
      });
      await this.audit.record(db, { userId, actor, action: 'category.update', subjectId: id, details: { ...dto } });
      return categoryResponse(row);
    });
  }

  async categoryOf(userId: string, id: string): Promise<MoneyCategory> {
    const row = await this.prisma.moneyCategory.findFirst({ where: { id, userId } });
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
    if (existing) return existing.id;
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
    archived: row.archivedAt !== null,
  };
}
