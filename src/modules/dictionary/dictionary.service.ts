import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { LearningService } from '@/modules/learning/learning.service';
import { LearningNoteResponse } from '@/modules/learning/learning.models';
import {
  CreateDictionaryEntryDto,
  UpdateDictionaryEntryDto,
  CreateCollocationDto,
  DictionarySearchQueryDto,
  DictionaryEntryResponse,
  DictionaryStatsResponse,
  DictionarySearchResult,
  CollocationResponse,
  CreateSemanticGroupDto,
  UpdateSemanticGroupDto,
  SemanticGroupResponse,
  RelatedWordResponse,
  WordWithRelatedResponse,
  CreateSynonymGroupDto,
  UpdateSynonymGroupDto,
  SynonymGroupResponse,
  SynonymGroupSummaryResponse,
  SynonymEntryResponse,
} from './dictionary.models';

// Type for dictionary entry with includes
type DictionaryEntryWithRelations = Prisma.DictionaryEntryGetPayload<{
  include: {
    collocations: true;
    learningNotes: {
      select: { id: true };
    };
  };
}>;

// Type for collocation
type CollocationData = Prisma.CollocationGetPayload<object>;

@Injectable()
export class DictionaryService {
  // Simple in-memory cache for related words lookup
  private relatedWordsCache = new Map<string, { data: WordWithRelatedResponse; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly learningService: LearningService,
  ) {}

  // ===== Entry CRUD =====

  async getEntries(
    userId: string,
    query: DictionarySearchQueryDto,
  ): Promise<DictionaryEntryResponse[]> {
    const {
      q,
      masteryLevel,
      tag,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      skip = 0,
      take = 50,
    } = query;

    const where: Prisma.DictionaryEntryWhereInput = {
      userId,
      deletedAt: null,
    };

    if (q) {
      where.word = { contains: q, mode: 'insensitive' };
    }

    if (masteryLevel !== undefined) {
      where.masteryLevel = masteryLevel;
    }

    if (tag) {
      where.tags = { has: tag };
    }

    const orderBy: Prisma.DictionaryEntryOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const entries = await this.prisma.dictionaryEntry.findMany({
      where,
      include: {
        collocations: true,
        learningNotes: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
      orderBy,
      skip,
      take,
    });

    return entries.map((entry) => this.mapEntryToResponse(entry));
  }

  async getEntry(userId: string, entryId: string): Promise<DictionaryEntryResponse> {
    const entry = await this.prisma.dictionaryEntry.findFirst({
      where: { id: entryId, deletedAt: null },
      include: {
        collocations: true,
        learningNotes: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    if (!entry) {
      throw new NotFoundException('Dictionary entry not found');
    }

    if (entry.userId !== userId) {
      throw new ForbiddenException('Not authorized to access this entry');
    }

    // Update lastReviewed when viewing
    await this.prisma.dictionaryEntry.update({
      where: { id: entryId },
      data: { lastReviewed: new Date() },
    });

    return this.mapEntryToResponse(entry);
  }

  async createEntry(
    userId: string,
    dto: CreateDictionaryEntryDto,
  ): Promise<DictionaryEntryResponse> {
    // Check for duplicate word
    const existing = await this.prisma.dictionaryEntry.findFirst({
      where: {
        userId,
        word: { equals: dto.word, mode: 'insensitive' },
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(`Entry for "${dto.word}" already exists`);
    }

    const entry = await this.prisma.dictionaryEntry.create({
      data: {
        userId,
        word: dto.word,
        partOfSpeech: dto.partOfSpeech || null,
        pronunciation: dto.pronunciation || null,
        definition: dto.definition,
        nuance: dto.nuance || null,
        personalExample: dto.personalExample,
        sourceContext: dto.sourceContext || null,
        tags: dto.tags || [],
        collocations: dto.collocations?.length
          ? {
              create: dto.collocations.map((c) => ({
                phrase: c.phrase,
                translation: c.translation || null,
                example: c.example || null,
              })),
            }
          : undefined,
      },
      include: {
        collocations: true,
        learningNotes: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    return this.mapEntryToResponse(entry);
  }

  async updateEntry(
    userId: string,
    entryId: string,
    dto: UpdateDictionaryEntryDto,
  ): Promise<DictionaryEntryResponse> {
    const entry = await this.prisma.dictionaryEntry.findFirst({
      where: { id: entryId, deletedAt: null },
    });

    if (!entry) {
      throw new NotFoundException('Dictionary entry not found');
    }

    if (entry.userId !== userId) {
      throw new ForbiddenException('Not authorized to update this entry');
    }

    // Check for duplicate word if word is being changed
    if (dto.word && dto.word.toLowerCase() !== entry.word.toLowerCase()) {
      const existing = await this.prisma.dictionaryEntry.findFirst({
        where: {
          userId,
          word: { equals: dto.word, mode: 'insensitive' },
          deletedAt: null,
          id: { not: entryId },
        },
      });

      if (existing) {
        throw new ConflictException(`Entry for "${dto.word}" already exists`);
      }
    }

    const updated = await this.prisma.dictionaryEntry.update({
      where: { id: entryId },
      data: {
        word: dto.word,
        partOfSpeech: dto.partOfSpeech,
        pronunciation: dto.pronunciation,
        definition: dto.definition,
        nuance: dto.nuance,
        personalExample: dto.personalExample,
        sourceContext: dto.sourceContext,
        tags: dto.tags,
      },
      include: {
        collocations: true,
        learningNotes: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    return this.mapEntryToResponse(updated);
  }

  async deleteEntry(userId: string, entryId: string): Promise<void> {
    const entry = await this.prisma.dictionaryEntry.findFirst({
      where: { id: entryId, deletedAt: null },
    });

    if (!entry) {
      throw new NotFoundException('Dictionary entry not found');
    }

    if (entry.userId !== userId) {
      throw new ForbiddenException('Not authorized to delete this entry');
    }

    // Soft delete
    await this.prisma.dictionaryEntry.update({
      where: { id: entryId },
      data: { deletedAt: new Date() },
    });
  }

  // ===== Collocations =====

  async addCollocation(
    userId: string,
    entryId: string,
    dto: CreateCollocationDto,
  ): Promise<CollocationResponse> {
    const entry = await this.prisma.dictionaryEntry.findFirst({
      where: { id: entryId, deletedAt: null },
    });

    if (!entry) {
      throw new NotFoundException('Dictionary entry not found');
    }

    if (entry.userId !== userId) {
      throw new ForbiddenException('Not authorized to modify this entry');
    }

    const collocation = await this.prisma.collocation.create({
      data: {
        entryId,
        phrase: dto.phrase,
        translation: dto.translation || null,
        example: dto.example || null,
      },
    });

    return {
      id: collocation.id,
      phrase: collocation.phrase,
      translation: collocation.translation,
      example: collocation.example,
      createdAt: collocation.createdAt,
    };
  }

  async removeCollocation(
    userId: string,
    entryId: string,
    collocationId: string,
  ): Promise<void> {
    const entry = await this.prisma.dictionaryEntry.findFirst({
      where: { id: entryId, deletedAt: null },
    });

    if (!entry) {
      throw new NotFoundException('Dictionary entry not found');
    }

    if (entry.userId !== userId) {
      throw new ForbiddenException('Not authorized to modify this entry');
    }

    const collocation = await this.prisma.collocation.findFirst({
      where: { id: collocationId, entryId },
    });

    if (!collocation) {
      throw new NotFoundException('Collocation not found');
    }

    await this.prisma.collocation.delete({
      where: { id: collocationId },
    });
  }

  // ===== Card Generation =====

  async createCardsFromEntry(userId: string, entryId: string): Promise<LearningNoteResponse> {
    const entry = await this.prisma.dictionaryEntry.findFirst({
      where: { id: entryId, deletedAt: null },
      include: { collocations: true },
    });

    if (!entry) {
      throw new NotFoundException('Dictionary entry not found');
    }

    if (entry.userId !== userId) {
      throw new ForbiddenException('Not authorized to access this entry');
    }

    // Build meaning from definition + nuance
    const meaning = entry.nuance
      ? `${entry.definition} (${entry.nuance})`
      : entry.definition;

    // Include collocations in notes
    let notes: string | undefined;
    if (entry.collocations.length > 0) {
      const collocationsText = entry.collocations
        .map((c) => `• ${c.phrase}${c.translation ? ` - ${c.translation}` : ''}`)
        .join('\n');
      notes = `Collocations:\n${collocationsText}`;
    }

    // Create learning note using existing service with dictionary source type
    const learningNote = await this.learningService.createNote(userId, {
      targetSentence: entry.personalExample,
      meaning,
      targetWord: entry.word,
      notes,
      dictionaryEntryId: entry.id,
      sourceType: 'dictionary',
    });

    // Update mastery level
    await this.updateMasteryLevel(entryId);

    return learningNote;
  }

  // ===== Statistics =====

  async getStats(userId: string): Promise<DictionaryStatsResponse> {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const [
      totalEntries,
      entriesWithCards,
      matureEntries,
      agingEntries,
      totalCollocations,
    ] = await Promise.all([
      this.prisma.dictionaryEntry.count({
        where: { userId, deletedAt: null },
      }),
      this.prisma.dictionaryEntry.count({
        where: { userId, deletedAt: null, masteryLevel: { gte: 1 } },
      }),
      this.prisma.dictionaryEntry.count({
        where: { userId, deletedAt: null, masteryLevel: 2 },
      }),
      this.prisma.dictionaryEntry.count({
        where: {
          userId,
          deletedAt: null,
          masteryLevel: 0,
          createdAt: { lt: threeDaysAgo },
        },
      }),
      this.prisma.collocation.count({
        where: { entry: { userId, deletedAt: null } },
      }),
    ]);

    return {
      totalEntries,
      entriesWithCards,
      matureEntries,
      entriesNeedingCards: totalEntries - entriesWithCards,
      agingEntries,
      totalCollocations,
    };
  }

  // ===== Search =====

  async searchEntries(
    userId: string,
    query: string,
    fuzzy: boolean = true,
  ): Promise<DictionarySearchResult[]> {
    if (!query || query.length < 1) {
      return [];
    }

    // First try exact prefix match
    const exactMatches = await this.prisma.dictionaryEntry.findMany({
      where: {
        userId,
        deletedAt: null,
        word: { startsWith: query, mode: 'insensitive' },
      },
      select: {
        id: true,
        word: true,
        partOfSpeech: true,
        definition: true,
        masteryLevel: true,
      },
      take: 10,
      orderBy: { word: 'asc' },
    });

    // If we have exact matches or fuzzy is disabled, return them
    if (exactMatches.length >= 5 || !fuzzy) {
      return exactMatches;
    }

    // If few exact matches, try fuzzy search using contains
    // This provides basic fuzzy matching without requiring pg_trgm extension
    const fuzzyMatches = await this.prisma.dictionaryEntry.findMany({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { word: { contains: query, mode: 'insensitive' } },
          { definition: { contains: query, mode: 'insensitive' } },
        ],
        NOT: {
          id: { in: exactMatches.map((e) => e.id) },
        },
      },
      select: {
        id: true,
        word: true,
        partOfSpeech: true,
        definition: true,
        masteryLevel: true,
      },
      take: 10 - exactMatches.length,
      orderBy: { word: 'asc' },
    });

    // Combine and return, exact matches first
    return [...exactMatches, ...fuzzyMatches];
  }

  /**
   * Advanced fuzzy search using PostgreSQL trigram similarity.
   * Requires pg_trgm extension to be enabled in the database.
   * Falls back to basic contains search if extension is not available.
   */
  async searchEntriesFuzzy(
    userId: string,
    query: string,
    limit: number = 10,
  ): Promise<DictionarySearchResult[]> {
    if (!query || query.length < 2) {
      return this.searchEntries(userId, query, false);
    }

    try {
      // Try trigram similarity search (requires pg_trgm extension)
      const results = await this.prisma.$queryRaw<DictionarySearchResult[]>`
        SELECT id, word, "partOfSpeech" as "partOfSpeech", definition, "masteryLevel" as "masteryLevel"
        FROM "DictionaryEntry"
        WHERE "userId" = ${userId}
          AND "deletedAt" IS NULL
          AND (
            word % ${query}
            OR similarity(word, ${query}) > 0.2
          )
        ORDER BY similarity(word, ${query}) DESC
        LIMIT ${limit}
      `;
      return results;
    } catch {
      // pg_trgm extension not available, fall back to basic search
      return this.searchEntries(userId, query, true);
    }
  }

  // ===== Helpers =====

  async updateMasteryLevel(entryId: string): Promise<void> {
    const entry = await this.prisma.dictionaryEntry.findFirst({
      where: { id: entryId },
      include: {
        learningNotes: {
          where: { deletedAt: null },
          include: {
            cards: {
              where: { isActive: true },
            },
          },
        },
      },
    });

    if (!entry) return;

    let masteryLevel = 0;

    if (entry.learningNotes.length > 0) {
      masteryLevel = 1;

      // Check if any cards are mature (stability >= 21 days)
      const hasMatureCards = entry.learningNotes.some((note) =>
        note.cards.some((card) => card.stability >= 21),
      );

      if (hasMatureCards) {
        masteryLevel = 2;
      }
    }

    await this.prisma.dictionaryEntry.update({
      where: { id: entryId },
      data: { masteryLevel },
    });
  }

  private mapEntryToResponse(entry: DictionaryEntryWithRelations): DictionaryEntryResponse {
    return {
      id: entry.id,
      userId: entry.userId,
      word: entry.word,
      partOfSpeech: entry.partOfSpeech,
      pronunciation: entry.pronunciation,
      definition: entry.definition,
      nuance: entry.nuance,
      personalExample: entry.personalExample,
      sourceContext: entry.sourceContext,
      tags: entry.tags,
      masteryLevel: entry.masteryLevel,
      lastReviewed: entry.lastReviewed,
      collocations: entry.collocations.map((c: CollocationData) => ({
        id: c.id,
        phrase: c.phrase,
        translation: c.translation,
        example: c.example,
        createdAt: c.createdAt,
      })),
      cardsCount: entry.learningNotes?.length || 0,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  // ===== Semantic Groups =====

  async getGroups(userId: string): Promise<SemanticGroupResponse[]> {
    const groups = await this.prisma.semanticGroup.findMany({
      where: { userId },
      include: {
        _count: { select: { entries: true } },
      },
      orderBy: { name: 'asc' },
    });

    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      color: g.color,
      entryCount: g._count.entries,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    }));
  }

  async createGroup(
    userId: string,
    dto: CreateSemanticGroupDto,
  ): Promise<SemanticGroupResponse> {
    const existing = await this.prisma.semanticGroup.findFirst({
      where: { userId, name: { equals: dto.name, mode: 'insensitive' } },
    });

    if (existing) {
      throw new ConflictException(`Group "${dto.name}" already exists`);
    }

    const group = await this.prisma.semanticGroup.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description || null,
        color: dto.color || null,
      },
    });

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      color: group.color,
      entryCount: 0,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  async updateGroup(
    userId: string,
    groupId: string,
    dto: UpdateSemanticGroupDto,
  ): Promise<SemanticGroupResponse> {
    const group = await this.prisma.semanticGroup.findFirst({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Semantic group not found');
    }

    if (group.userId !== userId) {
      throw new ForbiddenException('Not authorized to update this group');
    }

    if (dto.name && dto.name.toLowerCase() !== group.name.toLowerCase()) {
      const existing = await this.prisma.semanticGroup.findFirst({
        where: {
          userId,
          name: { equals: dto.name, mode: 'insensitive' },
          id: { not: groupId },
        },
      });

      if (existing) {
        throw new ConflictException(`Group "${dto.name}" already exists`);
      }
    }

    const updated = await this.prisma.semanticGroup.update({
      where: { id: groupId },
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color,
      },
      include: {
        _count: { select: { entries: true } },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      color: updated.color,
      entryCount: updated._count.entries,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteGroup(userId: string, groupId: string): Promise<void> {
    const group = await this.prisma.semanticGroup.findFirst({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Semantic group not found');
    }

    if (group.userId !== userId) {
      throw new ForbiddenException('Not authorized to delete this group');
    }

    await this.prisma.semanticGroup.delete({
      where: { id: groupId },
    });
  }

  // ===== Entry-Group Management =====

  async addEntryToGroups(
    userId: string,
    entryId: string,
    groupIds: string[],
  ): Promise<void> {
    const entry = await this.prisma.dictionaryEntry.findFirst({
      where: { id: entryId, deletedAt: null },
    });

    if (!entry) {
      throw new NotFoundException('Dictionary entry not found');
    }

    if (entry.userId !== userId) {
      throw new ForbiddenException('Not authorized to modify this entry');
    }

    // Verify all groups belong to user
    const groups = await this.prisma.semanticGroup.findMany({
      where: { id: { in: groupIds }, userId },
    });

    if (groups.length !== groupIds.length) {
      throw new NotFoundException('One or more groups not found');
    }

    // Create associations (skip existing)
    await this.prisma.entrySemanticGroup.createMany({
      data: groupIds.map((groupId) => ({
        entryId,
        groupId,
      })),
      skipDuplicates: true,
    });

    // Invalidate cache for this user
    this.invalidateUserCache(userId);
  }

  async removeEntryFromGroup(
    userId: string,
    entryId: string,
    groupId: string,
  ): Promise<void> {
    const entry = await this.prisma.dictionaryEntry.findFirst({
      where: { id: entryId, deletedAt: null },
    });

    if (!entry) {
      throw new NotFoundException('Dictionary entry not found');
    }

    if (entry.userId !== userId) {
      throw new ForbiddenException('Not authorized to modify this entry');
    }

    await this.prisma.entrySemanticGroup.deleteMany({
      where: { entryId, groupId },
    });

    // Invalidate cache for this user
    this.invalidateUserCache(userId);
  }

  async getEntryGroups(userId: string, entryId: string): Promise<SemanticGroupResponse[]> {
    const entry = await this.prisma.dictionaryEntry.findFirst({
      where: { id: entryId, deletedAt: null },
    });

    if (!entry) {
      throw new NotFoundException('Dictionary entry not found');
    }

    if (entry.userId !== userId) {
      throw new ForbiddenException('Not authorized to access this entry');
    }

    const associations = await this.prisma.entrySemanticGroup.findMany({
      where: { entryId },
      include: {
        group: {
          include: {
            _count: { select: { entries: true } },
          },
        },
      },
    });

    return associations.map((a) => ({
      id: a.group.id,
      name: a.group.name,
      description: a.group.description,
      color: a.group.color,
      entryCount: a.group._count.entries,
      createdAt: a.group.createdAt,
      updatedAt: a.group.updatedAt,
    }));
  }

  async getGroupEntries(
    userId: string,
    groupId: string,
  ): Promise<DictionarySearchResult[]> {
    const group = await this.prisma.semanticGroup.findFirst({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Semantic group not found');
    }

    if (group.userId !== userId) {
      throw new ForbiddenException('Not authorized to access this group');
    }

    const associations = await this.prisma.entrySemanticGroup.findMany({
      where: { groupId },
      include: {
        entry: {
          select: {
            id: true,
            word: true,
            partOfSpeech: true,
            definition: true,
            masteryLevel: true,
            deletedAt: true,
          },
        },
      },
      orderBy: { entry: { word: 'asc' } },
    });

    return associations
      .filter((a) => a.entry.deletedAt === null)
      .map((a) => ({
        id: a.entry.id,
        word: a.entry.word,
        partOfSpeech: a.entry.partOfSpeech,
        definition: a.entry.definition,
        masteryLevel: a.entry.masteryLevel,
      }));
  }

  // ===== Cache Helpers =====

  private getCacheKey(userId: string, term: string): string {
    return `${userId}:${term.toLowerCase()}`;
  }

  private invalidateUserCache(userId: string): void {
    for (const key of this.relatedWordsCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.relatedWordsCache.delete(key);
      }
    }
  }

  // ===== Word Lookup with Related Words =====

  async getWordWithRelated(userId: string, term: string): Promise<WordWithRelatedResponse> {
    // Check cache first
    const cacheKey = this.getCacheKey(userId, term);
    const cached = this.relatedWordsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const entry = await this.prisma.dictionaryEntry.findFirst({
      where: {
        userId,
        word: { equals: term, mode: 'insensitive' },
        deletedAt: null,
      },
      include: {
        collocations: true,
        learningNotes: {
          where: { deletedAt: null },
          select: { id: true },
        },
        semanticGroups: {
          include: {
            group: {
              include: {
                _count: { select: { entries: true } },
              },
            },
          },
        },
      },
    });

    if (!entry) {
      throw new NotFoundException(`Word "${term}" not found`);
    }

    const entryResponse = this.mapEntryToResponse(entry);

    const groups: SemanticGroupResponse[] = entry.semanticGroups.map((sg) => ({
      id: sg.group.id,
      name: sg.group.name,
      description: sg.group.description,
      color: sg.group.color,
      entryCount: sg.group._count.entries,
      createdAt: sg.group.createdAt,
      updatedAt: sg.group.updatedAt,
    }));

    // Find related words from shared groups
    const groupIds = entry.semanticGroups.map((sg) => sg.groupId);
    let relatedWords: RelatedWordResponse[] = [];

    if (groupIds.length > 0) {
      const relatedEntries = await this.prisma.dictionaryEntry.findMany({
        where: {
          userId,
          deletedAt: null,
          id: { not: entry.id },
          semanticGroups: {
            some: { groupId: { in: groupIds } },
          },
        },
        include: {
          semanticGroups: {
            where: { groupId: { in: groupIds } },
            include: { group: true },
          },
        },
        orderBy: { word: 'asc' },
      });

      // Build related words with shared group names
      const relatedWithCounts = relatedEntries.map((re) => {
        const sharedGroups = re.semanticGroups.map((sg) => sg.group.name);
        return {
          id: re.id,
          word: re.word,
          definition: re.definition,
          partOfSpeech: re.partOfSpeech,
          sharedGroups,
          overlapCount: sharedGroups.length,
        };
      });

      // Sort by overlap count (most shared groups first)
      relatedWithCounts.sort((a, b) => b.overlapCount - a.overlapCount);

      relatedWords = relatedWithCounts.map(({ overlapCount: _overlapCount, ...rest }) => rest);
    }

    const result: WordWithRelatedResponse = {
      entry: entryResponse,
      groups,
      relatedWords,
    };

    // Cache the result
    this.relatedWordsCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    return result;
  }

  // ===== Synonym Groups =====

  async getSynonymGroups(userId: string): Promise<SynonymGroupSummaryResponse[]> {
    const groups = await this.prisma.synonymGroup.findMany({
      where: { userId },
      include: {
        _count: { select: { entries: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      entryCount: g._count.entries,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    }));
  }

  async getSynonymGroup(userId: string, groupId: string): Promise<SynonymGroupResponse> {
    const group = await this.prisma.synonymGroup.findFirst({
      where: { id: groupId },
      include: {
        entries: {
          include: {
            entry: {
              select: {
                id: true,
                word: true,
                definition: true,
                partOfSpeech: true,
                masteryLevel: true,
                deletedAt: true,
              },
            },
          },
          orderBy: { entry: { word: 'asc' } },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Synonym group not found');
    }

    if (group.userId !== userId) {
      throw new ForbiddenException('Not authorized to access this synonym group');
    }

    const entries: SynonymEntryResponse[] = group.entries
      .filter((e) => e.entry.deletedAt === null)
      .map((e) => ({
        id: e.entry.id,
        word: e.entry.word,
        definition: e.entry.definition,
        partOfSpeech: e.entry.partOfSpeech,
        masteryLevel: e.entry.masteryLevel,
      }));

    return {
      id: group.id,
      name: group.name,
      entryCount: entries.length,
      entries,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  async createSynonymGroup(
    userId: string,
    dto: CreateSynonymGroupDto,
  ): Promise<SynonymGroupResponse> {
    // Verify all entries belong to user
    const entries = await this.prisma.dictionaryEntry.findMany({
      where: {
        id: { in: dto.entryIds },
        userId,
        deletedAt: null,
      },
      select: {
        id: true,
        word: true,
        definition: true,
        partOfSpeech: true,
        masteryLevel: true,
      },
    });

    if (entries.length !== dto.entryIds.length) {
      throw new NotFoundException('One or more entries not found');
    }

    if (entries.length < 2) {
      throw new ConflictException('A synonym group requires at least 2 entries');
    }

    const group = await this.prisma.synonymGroup.create({
      data: {
        userId,
        name: dto.name || null,
        entries: {
          create: dto.entryIds.map((entryId) => ({
            entryId,
          })),
        },
      },
    });

    // Invalidate cache for affected words
    this.invalidateUserCache(userId);

    return {
      id: group.id,
      name: group.name,
      entryCount: entries.length,
      entries: entries.map((e) => ({
        id: e.id,
        word: e.word,
        definition: e.definition,
        partOfSpeech: e.partOfSpeech,
        masteryLevel: e.masteryLevel,
      })),
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  async updateSynonymGroup(
    userId: string,
    groupId: string,
    dto: UpdateSynonymGroupDto,
  ): Promise<SynonymGroupResponse> {
    const group = await this.prisma.synonymGroup.findFirst({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Synonym group not found');
    }

    if (group.userId !== userId) {
      throw new ForbiddenException('Not authorized to update this synonym group');
    }

    await this.prisma.synonymGroup.update({
      where: { id: groupId },
      data: { name: dto.name },
    });

    return this.getSynonymGroup(userId, groupId);
  }

  async deleteSynonymGroup(userId: string, groupId: string): Promise<void> {
    const group = await this.prisma.synonymGroup.findFirst({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Synonym group not found');
    }

    if (group.userId !== userId) {
      throw new ForbiddenException('Not authorized to delete this synonym group');
    }

    await this.prisma.synonymGroup.delete({
      where: { id: groupId },
    });

    this.invalidateUserCache(userId);
  }

  async addEntriesToSynonymGroup(
    userId: string,
    groupId: string,
    entryIds: string[],
  ): Promise<SynonymGroupResponse> {
    const group = await this.prisma.synonymGroup.findFirst({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Synonym group not found');
    }

    if (group.userId !== userId) {
      throw new ForbiddenException('Not authorized to modify this synonym group');
    }

    // Verify all entries belong to user
    const entries = await this.prisma.dictionaryEntry.findMany({
      where: {
        id: { in: entryIds },
        userId,
        deletedAt: null,
      },
    });

    if (entries.length !== entryIds.length) {
      throw new NotFoundException('One or more entries not found');
    }

    // Add entries (skip duplicates)
    await this.prisma.entrySynonymGroup.createMany({
      data: entryIds.map((entryId) => ({
        entryId,
        groupId,
      })),
      skipDuplicates: true,
    });

    this.invalidateUserCache(userId);

    return this.getSynonymGroup(userId, groupId);
  }

  async removeEntryFromSynonymGroup(
    userId: string,
    groupId: string,
    entryId: string,
  ): Promise<SynonymGroupResponse | null> {
    const group = await this.prisma.synonymGroup.findFirst({
      where: { id: groupId },
      include: {
        _count: { select: { entries: true } },
      },
    });

    if (!group) {
      throw new NotFoundException('Synonym group not found');
    }

    if (group.userId !== userId) {
      throw new ForbiddenException('Not authorized to modify this synonym group');
    }

    // Remove the entry
    await this.prisma.entrySynonymGroup.deleteMany({
      where: { groupId, entryId },
    });

    // If group would have less than 2 entries, delete it entirely
    const remainingCount = group._count.entries - 1;
    if (remainingCount < 2) {
      await this.prisma.synonymGroup.delete({
        where: { id: groupId },
      });
      this.invalidateUserCache(userId);
      return null;
    }

    this.invalidateUserCache(userId);
    return this.getSynonymGroup(userId, groupId);
  }

  async getEntrySynonymGroups(userId: string, entryId: string): Promise<SynonymGroupSummaryResponse[]> {
    const entry = await this.prisma.dictionaryEntry.findFirst({
      where: { id: entryId, deletedAt: null },
    });

    if (!entry) {
      throw new NotFoundException('Dictionary entry not found');
    }

    if (entry.userId !== userId) {
      throw new ForbiddenException('Not authorized to access this entry');
    }

    const associations = await this.prisma.entrySynonymGroup.findMany({
      where: { entryId },
      include: {
        group: {
          include: {
            _count: { select: { entries: true } },
          },
        },
      },
    });

    return associations.map((a) => ({
      id: a.group.id,
      name: a.group.name,
      entryCount: a.group._count.entries,
      createdAt: a.group.createdAt,
      updatedAt: a.group.updatedAt,
    }));
  }

  async getEntrySynonyms(userId: string, entryId: string): Promise<SynonymEntryResponse[]> {
    const entry = await this.prisma.dictionaryEntry.findFirst({
      where: { id: entryId, deletedAt: null },
    });

    if (!entry) {
      throw new NotFoundException('Dictionary entry not found');
    }

    if (entry.userId !== userId) {
      throw new ForbiddenException('Not authorized to access this entry');
    }

    // Get all synonym groups this entry belongs to
    const entryGroups = await this.prisma.entrySynonymGroup.findMany({
      where: { entryId },
      select: { groupId: true },
    });

    const groupIds = entryGroups.map((eg) => eg.groupId);

    if (groupIds.length === 0) {
      return [];
    }

    // Get all entries in those groups (excluding the current entry)
    const synonymEntries = await this.prisma.entrySynonymGroup.findMany({
      where: {
        groupId: { in: groupIds },
        entryId: { not: entryId },
      },
      include: {
        entry: {
          select: {
            id: true,
            word: true,
            definition: true,
            partOfSpeech: true,
            masteryLevel: true,
            deletedAt: true,
          },
        },
      },
    });

    // Deduplicate and filter deleted entries
    const uniqueEntries = new Map<string, SynonymEntryResponse>();
    for (const se of synonymEntries) {
      if (se.entry.deletedAt === null && !uniqueEntries.has(se.entry.id)) {
        uniqueEntries.set(se.entry.id, {
          id: se.entry.id,
          word: se.entry.word,
          definition: se.entry.definition,
          partOfSpeech: se.entry.partOfSpeech,
          masteryLevel: se.entry.masteryLevel,
        });
      }
    }

    return Array.from(uniqueEntries.values()).sort((a, b) => a.word.localeCompare(b.word));
  }

  async linkEntriesAsSynonyms(
    userId: string,
    entryIds: string[],
    name?: string,
  ): Promise<SynonymGroupResponse> {
    // This is a convenience method that creates a new synonym group
    return this.createSynonymGroup(userId, { entryIds, name });
  }
}
