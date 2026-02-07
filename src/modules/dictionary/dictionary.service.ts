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

    // Create learning note using existing service
    const learningNote = await this.learningService.createNote(userId, {
      targetSentence: entry.personalExample,
      meaning,
      targetWord: entry.word,
      notes,
      dictionaryEntryId: entry.id,
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
  ): Promise<DictionarySearchResult[]> {
    if (!query || query.length < 1) {
      return [];
    }

    const entries = await this.prisma.dictionaryEntry.findMany({
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

    return entries;
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
}
