import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import {
  LearningExportResponse,
  ExportNoteData,
  ExportCardData,
  ImportLearningDataDto,
  ImportResultResponse,
} from './dto/export.dto';
import { CardType, CardState, NoteSourceType } from './learning.models';
import { StatsService } from './services/stats.service';

const EXPORT_VERSION = '1.0';

@Injectable()
export class LearningExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: StatsService,
  ) {}

  /**
   * Export all learning data for a user
   */
  async exportData(userId: string): Promise<LearningExportResponse> {
    // Get all notes with cards
    const notes = await this.prisma.learningNote.findMany({
      where: { userId, deletedAt: null },
      include: { cards: true },
      orderBy: { createdAt: 'asc' },
    });

    // Get settings
    const settings = await this.prisma.userLearningSettings.findUnique({
      where: { userId },
    });

    // Get statistics
    const statsData = await this.stats.getStats(userId);

    // Map notes to export format
    const exportNotes: ExportNoteData[] = notes.map((note) => ({
      targetSentence: note.targetSentence,
      meaning: note.meaning,
      targetWord: note.targetWord,
      notes: note.notes,
      alternativePhrasing: note.alternativePhrasing,
      sourceType: note.sourceType as NoteSourceType,
      createdAt: note.createdAt.toISOString(),
      cards: note.cards
        .filter((card) => card.isActive)
        .map(
          (card): ExportCardData => ({
            cardType: card.cardType as CardType,
            front: card.front,
            back: card.back,
            state: card.state as CardState,
            difficulty: card.difficulty,
            stability: card.stability,
            reviewCount: card.reviewCount,
            clozeIndex: card.clozeIndex,
          }),
        ),
    }));

    return {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      statistics: {
        totalNotes: notes.length,
        matureVocabulary: statsData.matureVocabulary,
        retentionRate: statsData.retentionRate,
      },
      notes: exportNotes,
      settings: {
        generateRecognition: settings?.generateRecognition ?? true,
        generateProduction: settings?.generateProduction ?? true,
        generateCloze: settings?.generateCloze ?? false,
        newCardsPerDay: settings?.newCardsPerDay ?? 20,
        maxReviewsPerDay: settings?.maxReviewsPerDay ?? 200,
      },
    };
  }

  /**
   * Export notes as CSV (simplified format without cards)
   */
  async exportCsv(userId: string): Promise<string> {
    const notes = await this.prisma.learningNote.findMany({
      where: { userId, deletedAt: null },
      include: { cards: { where: { isActive: true }, take: 1 } },
      orderBy: { createdAt: 'asc' },
    });

    // CSV header
    const header = [
      'Target Sentence',
      'Meaning',
      'Target Word',
      'Notes',
      'Source Type',
      'Created At',
      'Card State',
      'Difficulty',
      'Review Count',
    ].join(',');

    // CSV rows
    const rows = notes.map((note) => {
      const card = note.cards[0];
      return [
        this.escapeCsv(note.targetSentence),
        this.escapeCsv(note.meaning),
        this.escapeCsv(note.targetWord),
        this.escapeCsv(note.notes || ''),
        note.sourceType,
        note.createdAt.toISOString(),
        card?.state || 'new',
        card?.difficulty?.toFixed(2) || '0.30',
        card?.reviewCount?.toString() || '0',
      ].join(',');
    });

    return [header, ...rows].join('\n');
  }

  /**
   * Import learning data
   */
  async importData(
    userId: string,
    dto: ImportLearningDataDto,
  ): Promise<ImportResultResponse> {
    // Validate version
    if (!dto.version || !dto.version.startsWith('1.')) {
      throw new BadRequestException(
        `Unsupported export version: ${dto.version}. Expected version 1.x`,
      );
    }

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    // Get existing notes if skipExisting is true
    const existingNotes = dto.skipExisting
      ? await this.prisma.learningNote.findMany({
          where: { userId, deletedAt: null },
          select: { targetSentence: true, targetWord: true },
        })
      : [];

    const existingSet = new Set(
      existingNotes.map((n) => `${n.targetSentence}|||${n.targetWord}`),
    );

    for (const noteData of dto.notes) {
      try {
        // Check if note already exists
        if (
          dto.skipExisting &&
          existingSet.has(`${noteData.targetSentence}|||${noteData.targetWord}`)
        ) {
          skipped++;
          continue;
        }

        // Create note
        const note = await this.prisma.learningNote.create({
          data: {
            userId,
            targetSentence: noteData.targetSentence,
            meaning: noteData.meaning,
            targetWord: noteData.targetWord,
            notes: noteData.notes,
            alternativePhrasing: noteData.alternativePhrasing,
            sourceType: noteData.sourceType || NoteSourceType.MANUAL,
            createdAt: new Date(noteData.createdAt),
          },
        });

        // Create cards if provided
        if (noteData.cards && noteData.cards.length > 0) {
          await this.prisma.learningCard.createMany({
            data: noteData.cards.map((card) => ({
              userId,
              noteId: note.id,
              cardType: card.cardType,
              front: card.front,
              back: card.back,
              state: card.state,
              difficulty: card.difficulty,
              stability: card.stability,
              reviewCount: card.reviewCount,
              clozeIndex: card.clozeIndex,
              dueAt: this.calculateDueDate(card.stability, card.state),
            })),
          });
        }

        imported++;
      } catch (error) {
        errors++;
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        errorMessages.push(
          `Failed to import note "${noteData.targetWord}": ${message}`,
        );
      }
    }

    return {
      imported,
      skipped,
      errors,
      errorMessages: errorMessages.slice(0, 10), // Limit error messages
    };
  }

  /**
   * Calculate due date based on stability and state
   */
  private calculateDueDate(stability: number, state: CardState): Date {
    const now = new Date();

    // New cards are due immediately
    if (state === CardState.NEW) {
      return now;
    }

    // Learning/relearning cards have short intervals
    if (state === CardState.LEARNING || state === CardState.RELEARNING) {
      return new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes
    }

    // Review cards use stability-based interval
    const TARGET_RETENTION = 0.9;
    const intervalDays = stability * (Math.log(TARGET_RETENTION) / Math.log(0.9));
    const cappedInterval = Math.min(365, Math.max(1, Math.round(intervalDays)));

    return new Date(now.getTime() + cappedInterval * 24 * 60 * 60 * 1000);
  }

  /**
   * Escape CSV field
   */
  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
