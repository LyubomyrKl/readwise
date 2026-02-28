import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { ValidatorService } from './services/validator.service';
import { CardGeneratorService } from './services/card-generator.service';
import { SchedulerService } from './services/scheduler.service';
import { StatsService } from './services/stats.service';
import {
  CreateLearningNoteDto,
  UpdateLearningNoteDto,
  ValidateNoteDto,
  SubmitReviewDto,
  EndSessionDto,
  UpdateSettingsDto,
  ValidationResultResponse,
  LearningNoteResponse,
  LearningCardResponse,
  StudyQueueResponse,
  SessionStartResponse,
  ReviewResultResponse,
  StatsResponse,
  DailyStatsResponse,
  SettingsResponse,
  CardType,
  CardState,
  CardSourceType,
  ReviewRating,
  NoteSourceType,
} from './learning.models';

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: ValidatorService,
    private readonly cardGenerator: CardGeneratorService,
    private readonly scheduler: SchedulerService,
    private readonly stats: StatsService,
  ) {}

  // ===== Notes =====

  /**
   * Get all learning notes for a user
   */
  async getNotes(userId: string): Promise<LearningNoteResponse[]> {
    const notes = await this.prisma.learningNote.findMany({
      where: { userId, deletedAt: null },
      include: { cards: true },
      orderBy: { createdAt: 'desc' },
    });

    return notes.map((note) => this.mapNoteToResponse(note));
  }

  /**
   * Get a single learning note
   */
  async getNote(userId: string, noteId: string): Promise<LearningNoteResponse> {
    const note = await this.prisma.learningNote.findFirst({
      where: { id: noteId, deletedAt: null },
      include: { cards: true },
    });

    if (!note) {
      throw new NotFoundException('Learning note not found');
    }

    if (note.userId !== userId) {
      throw new ForbiddenException('Not authorized to access this note');
    }

    return this.mapNoteToResponse(note);
  }

  /**
   * Create a learning note and generate cards
   */
  async createNote(
    userId: string,
    dto: CreateLearningNoteDto,
  ): Promise<LearningNoteResponse> {
    // Validate content
    const validation = this.validator.validate({
      targetSentence: dto.targetSentence,
      meaning: dto.meaning,
      targetWord: dto.targetWord,
    });

    if (!validation.isValid) {
      throw new BadRequestException({
        message: 'Invalid note content',
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    // Verify book exists if provided
    if (dto.bookId) {
      const book = await this.prisma.book.findFirst({
        where: { id: dto.bookId, userId },
      });
      if (!book) {
        throw new NotFoundException('Book not found');
      }
    }

    // Verify highlight exists if provided
    if (dto.highlightId) {
      const highlight = await this.prisma.highlight.findFirst({
        where: { id: dto.highlightId, userId },
      });
      if (!highlight) {
        throw new NotFoundException('Highlight not found');
      }
    }

    // Get user settings for card generation
    const settings = await this.getOrCreateSettings(userId);

    // Determine source type for note storage
    let sourceType: NoteSourceType = NoteSourceType.MANUAL;
    if (dto.dictionaryEntryId || dto.sourceType === 'dictionary') {
      sourceType = NoteSourceType.DICTIONARY;
    } else if (dto.highlightId) {
      sourceType = NoteSourceType.HIGHLIGHT;
    }

    // Determine card source type for card generation templates
    const cardSourceType =
      sourceType === NoteSourceType.DICTIONARY
        ? CardSourceType.DICTIONARY
        : CardSourceType.SENTENCE;

    // Create note
    const note = await this.prisma.learningNote.create({
      data: {
        userId,
        bookId: dto.bookId || null,
        highlightId: dto.highlightId || null,
        dictionaryEntryId: dto.dictionaryEntryId || null,
        targetSentence: dto.targetSentence,
        meaning: dto.meaning,
        targetWord: dto.targetWord,
        notes: dto.notes || null,
        alternativePhrasing: dto.alternativePhrasing || null,
        sourceType,
      },
    });

    // Generate cards with appropriate source type
    const generatedCards = this.cardGenerator.generateCards(
      {
        id: note.id,
        targetSentence: note.targetSentence,
        meaning: note.meaning,
        targetWord: note.targetWord,
        notes: note.notes,
        alternativePhrasing: note.alternativePhrasing,
      },
      {
        generateRecognition: settings.generateRecognition,
        generateProduction: settings.generateProduction,
        generateCloze: settings.generateCloze,
        sourceType: cardSourceType,
      },
    );

    // Create cards in database
    await this.prisma.learningCard.createMany({
      data: generatedCards.map((card) => ({
        userId,
        noteId: note.id,
        cardType: card.cardType,
        front: card.front,
        back: card.back,
        clozeIndex: card.clozeIndex ?? null,
      })),
    });

    // Fetch complete note with cards
    return this.getNote(userId, note.id);
  }

  /**
   * Create a learning note from a highlight
   */
  async createNoteFromHighlight(
    userId: string,
    highlightId: string,
    dto: Omit<CreateLearningNoteDto, 'highlightId'>,
  ): Promise<LearningNoteResponse> {
    const highlight = await this.prisma.highlight.findFirst({
      where: { id: highlightId, userId, deletedAt: null },
    });

    if (!highlight) {
      throw new NotFoundException('Highlight not found');
    }

    return this.createNote(userId, {
      ...dto,
      highlightId,
      bookId: highlight.bookId,
    });
  }

  /**
   * Validate note content without creating
   */
  validateNote(dto: ValidateNoteDto): ValidationResultResponse {
    return this.validator.validate(dto);
  }

  /**
   * Update a learning note
   */
  async updateNote(
    userId: string,
    noteId: string,
    dto: UpdateLearningNoteDto,
  ): Promise<LearningNoteResponse> {
    const note = await this.prisma.learningNote.findFirst({
      where: { id: noteId, deletedAt: null },
    });

    if (!note) {
      throw new NotFoundException('Learning note not found');
    }

    if (note.userId !== userId) {
      throw new ForbiddenException('Not authorized to update this note');
    }

    // Validate if content is changing
    if (dto.targetSentence || dto.meaning || dto.targetWord) {
      const validation = this.validator.validate({
        targetSentence: dto.targetSentence || note.targetSentence,
        meaning: dto.meaning || note.meaning,
        targetWord: dto.targetWord || note.targetWord,
      });

      if (!validation.isValid) {
        throw new BadRequestException({
          message: 'Invalid note content',
          errors: validation.errors,
          warnings: validation.warnings,
        });
      }
    }

    await this.prisma.learningNote.update({
      where: { id: noteId },
      data: {
        targetSentence: dto.targetSentence,
        meaning: dto.meaning,
        targetWord: dto.targetWord,
        notes: dto.notes,
        alternativePhrasing: dto.alternativePhrasing,
        isArchived: dto.isArchived,
      },
    });

    // If content changed, regenerate cards
    if (dto.targetSentence || dto.meaning || dto.targetWord) {
      await this.regenerateCards(userId, noteId);
    }

    return this.getNote(userId, noteId);
  }

  /**
   * Delete a learning note (soft delete)
   */
  async deleteNote(userId: string, noteId: string): Promise<void> {
    const note = await this.prisma.learningNote.findFirst({
      where: { id: noteId, deletedAt: null },
    });

    if (!note) {
      throw new NotFoundException('Learning note not found');
    }

    if (note.userId !== userId) {
      throw new ForbiddenException('Not authorized to delete this note');
    }

    await this.prisma.$transaction([
      // Soft delete note
      this.prisma.learningNote.update({
        where: { id: noteId },
        data: { deletedAt: new Date() },
      }),
      // Deactivate all cards
      this.prisma.learningCard.updateMany({
        where: { noteId },
        data: { isActive: false },
      }),
    ]);
  }

  // ===== Study Queue =====

  /**
   * Get cards due for study
   *
   * Key principle: ONE CARD PER NOTE per session
   * This prevents showing the same word multiple times in a row.
   * For legacy data with multiple cards per note, we prefer production cards.
   */
  async getStudyQueue(userId: string): Promise<StudyQueueResponse> {
    const settings = await this.getOrCreateSettings(userId);
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get today's review count
    const todayReviewCount = await this.prisma.cardReview.count({
      where: {
        userId,
        reviewedAt: { gte: today },
      },
    });

    // Get today's new card count
    const todayNewCount = await this.prisma.cardReview.count({
      where: {
        userId,
        reviewedAt: { gte: today },
        previousState: 'new',
      },
    });

    // Calculate remaining limits
    const remainingNew = Math.max(0, settings.newCardsPerDay - todayNewCount);
    const remainingReviews = Math.max(
      0,
      settings.maxReviewsPerDay - todayReviewCount,
    );

    // Check if should throttle new cards
    const todayLapses = await this.prisma.cardReview.count({
      where: {
        userId,
        reviewedAt: { gte: today },
        rating: 'again',
      },
    });

    const correctRate =
      todayReviewCount > 0
        ? (todayReviewCount - todayLapses) / todayReviewCount
        : 1;

    const shouldThrottle = this.scheduler.shouldThrottleNewCards(
      todayLapses,
      correctRate,
      0,
    );

    // Fetch cards (fetch more than needed to allow deduplication)
    const [newCards, learningCards, reviewCards] = await Promise.all([
      // New cards (never reviewed)
      this.prisma.learningCard.findMany({
        where: {
          userId,
          isActive: true,
          state: 'new',
          note: { deletedAt: null, isArchived: false },
        },
        take: (shouldThrottle ? Math.floor(remainingNew / 2) : remainingNew) * 3,
        orderBy: [
          // Prefer production cards for consistent learning
          { cardType: 'asc' }, // 'production' comes before 'recognition' alphabetically
          { createdAt: 'asc' },
        ],
      }),

      // Learning/relearning cards (short intervals)
      this.prisma.learningCard.findMany({
        where: {
          userId,
          isActive: true,
          state: { in: ['learning', 'relearning'] },
          dueAt: { lte: now },
          note: { deletedAt: null, isArchived: false },
        },
        orderBy: [{ cardType: 'asc' }, { dueAt: 'asc' }],
      }),

      // Review cards
      this.prisma.learningCard.findMany({
        where: {
          userId,
          isActive: true,
          state: 'review',
          dueAt: { lte: now },
          note: { deletedAt: null, isArchived: false },
        },
        take: remainingReviews * 3,
        orderBy: [{ cardType: 'asc' }, { dueAt: 'asc' }],
      }),
    ]);

    // Deduplicate: ONE card per note (prefer production cards)
    const dedupeByNoteId = <T extends { noteId: string; cardType: string }>(
      cards: T[],
    ): T[] => {
      const seen = new Set<string>();
      return cards.filter((card) => {
        if (seen.has(card.noteId)) return false;
        seen.add(card.noteId);
        return true;
      });
    };

    // Cards are already sorted by cardType (production first), so deduplication keeps production
    const dedupedNew = dedupeByNoteId(newCards).slice(
      0,
      shouldThrottle ? Math.floor(remainingNew / 2) : remainingNew,
    );
    const dedupedLearning = dedupeByNoteId(learningCards);
    const dedupedReview = dedupeByNoteId(reviewCards).slice(0, remainingReviews);

    const totalDue =
      dedupedNew.length + dedupedLearning.length + dedupedReview.length;

    return {
      newCards: dedupedNew.map((c) => this.mapCardToResponse(c)),
      learningCards: dedupedLearning.map((c) => this.mapCardToResponse(c)),
      reviewCards: dedupedReview.map((c) => this.mapCardToResponse(c)),
      totalDue,
      newAvailable: dedupedNew.length,
      reviewsAvailable: dedupedReview.length,
    };
  }

  // ===== Study Session =====

  /**
   * Start a new study session
   */
  async startSession(userId: string): Promise<SessionStartResponse> {
    const session = await this.prisma.learningSession.create({
      data: { userId },
    });

    return {
      sessionId: session.id,
      startedAt: session.startedAt,
    };
  }

  /**
   * End a study session
   */
  async endSession(userId: string, dto: EndSessionDto): Promise<void> {
    const session = await this.prisma.learningSession.findFirst({
      where: { id: dto.sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Get session stats
    const reviews = await this.prisma.cardReview.findMany({
      where: {
        userId,
        reviewedAt: { gte: session.startedAt },
      },
    });

    const newCardsStudied = reviews.filter(
      (r) => r.previousState === 'new',
    ).length;
    const correctCount = reviews.filter((r) => r.rating !== 'again').length;

    await this.prisma.learningSession.update({
      where: { id: dto.sessionId },
      data: {
        endedAt: new Date(),
        reviewsCompleted: reviews.length,
        newCardsStudied,
        correctCount,
        incorrectCount: reviews.length - correctCount,
        totalTimeMs: dto.totalTimeMs,
      },
    });

    // Update aggregated stats
    await this.stats.updateStats(userId);
  }

  /**
   * Submit a card review
   */
  async submitReview(
    userId: string,
    dto: SubmitReviewDto,
  ): Promise<ReviewResultResponse> {
    const card = await this.prisma.learningCard.findFirst({
      where: { id: dto.cardId, isActive: true },
    });

    if (!card) {
      throw new NotFoundException('Card not found');
    }

    if (card.userId !== userId) {
      throw new ForbiddenException('Not authorized to review this card');
    }

    // Calculate new schedule
    const schedule = this.scheduler.calculateSchedule(
      {
        difficulty: card.difficulty,
        stability: card.stability,
        state: card.state as CardState,
        lapseCount: card.lapseCount,
        reviewCount: card.reviewCount,
      },
      {
        rating: dto.rating,
        responseTimeMs: dto.responseTimeMs,
        wasHesitant: dto.wasHesitant || false,
      },
    );

    // Create review record
    await this.prisma.cardReview.create({
      data: {
        userId,
        cardId: card.id,
        rating: dto.rating,
        responseTimeMs: dto.responseTimeMs,
        wasHesitant: dto.wasHesitant || false,
        previousDifficulty: card.difficulty,
        previousStability: card.stability,
        previousState: card.state as CardState,
        newDifficulty: schedule.newDifficulty,
        newStability: schedule.newStability,
        newInterval: schedule.intervalDays,
      },
    });

    // Update card
    const isLapse = dto.rating === ReviewRating.AGAIN;
    const avgResponseTime = card.avgResponseTime
      ? (card.avgResponseTime + dto.responseTimeMs) / 2
      : dto.responseTimeMs;

    await this.prisma.learningCard.update({
      where: { id: card.id },
      data: {
        difficulty: schedule.newDifficulty,
        stability: schedule.newStability,
        state: schedule.newState,
        dueAt: schedule.nextDueAt,
        lastReviewedAt: new Date(),
        lapseCount: isLapse ? card.lapseCount + 1 : card.lapseCount,
        reviewCount: card.reviewCount + 1,
        consecutiveCorrect: isLapse ? 0 : card.consecutiveCorrect + 1,
        avgResponseTime,
        hesitationCount: dto.wasHesitant
          ? card.hesitationCount + 1
          : card.hesitationCount,
      },
    });

    return {
      cardId: card.id,
      newDifficulty: schedule.newDifficulty,
      newStability: schedule.newStability,
      newState: schedule.newState,
      intervalDays: schedule.intervalDays,
      nextDueAt: schedule.nextDueAt,
    };
  }

  // ===== Statistics =====

  async getStats(userId: string): Promise<StatsResponse> {
    return this.stats.getStats(userId);
  }

  async getDailyStats(userId: string): Promise<DailyStatsResponse[]> {
    return this.stats.getDailyStats(userId);
  }

  // ===== Settings =====

  async getSettings(userId: string): Promise<SettingsResponse> {
    const settings = await this.getOrCreateSettings(userId);
    return {
      generateRecognition: settings.generateRecognition,
      generateProduction: settings.generateProduction,
      generateCloze: settings.generateCloze,
      newCardsPerDay: settings.newCardsPerDay,
      maxReviewsPerDay: settings.maxReviewsPerDay,
      showResponseTime: settings.showResponseTime,
      enforceProduction: settings.enforceProduction,
      requireTyping: settings.requireTyping,
    };
  }

  async updateSettings(
    userId: string,
    dto: UpdateSettingsDto,
  ): Promise<SettingsResponse> {
    await this.prisma.userLearningSettings.upsert({
      where: { userId },
      update: dto,
      create: {
        userId,
        ...dto,
      },
    });

    return this.getSettings(userId);
  }

  // ===== Private Helpers =====

  private async getOrCreateSettings(userId: string) {
    let settings = await this.prisma.userLearningSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await this.prisma.userLearningSettings.create({
        data: { userId },
      });
    }

    return settings;
  }

  private async regenerateCards(userId: string, noteId: string): Promise<void> {
    const note = await this.prisma.learningNote.findUnique({
      where: { id: noteId },
    });

    if (!note) return;

    const settings = await this.getOrCreateSettings(userId);

    // Determine card source type from note's source type
    const cardSourceType =
      note.sourceType === NoteSourceType.DICTIONARY
        ? CardSourceType.DICTIONARY
        : CardSourceType.SENTENCE;

    // Deactivate old cards
    await this.prisma.learningCard.updateMany({
      where: { noteId },
      data: { isActive: false },
    });

    // Generate new cards with appropriate source type
    const generatedCards = this.cardGenerator.generateCards(
      {
        id: note.id,
        targetSentence: note.targetSentence,
        meaning: note.meaning,
        targetWord: note.targetWord,
        notes: note.notes,
        alternativePhrasing: note.alternativePhrasing,
      },
      {
        generateRecognition: settings.generateRecognition,
        generateProduction: settings.generateProduction,
        generateCloze: settings.generateCloze,
        sourceType: cardSourceType,
      },
    );

    await this.prisma.learningCard.createMany({
      data: generatedCards.map((card) => ({
        userId,
        noteId,
        cardType: card.cardType,
        front: card.front,
        back: card.back,
        clozeIndex: card.clozeIndex ?? null,
      })),
    });
  }

  private async getCardTypeAccuracy(
    userId: string,
    cardType: CardType,
  ): Promise<number> {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 30);

    const reviews = await this.prisma.cardReview.findMany({
      where: {
        userId,
        reviewedAt: { gte: windowStart },
        card: { cardType },
      },
    });

    if (reviews.length === 0) return 0;

    const correct = reviews.filter((r) => r.rating !== 'again').length;
    return correct / reviews.length;
  }

  private mapNoteToResponse(
    note: Prisma.LearningNoteGetPayload<{ include: { cards: true } }>,
  ): LearningNoteResponse {
    return {
      id: note.id,
      userId: note.userId,
      bookId: note.bookId,
      highlightId: note.highlightId,
      targetSentence: note.targetSentence,
      meaning: note.meaning,
      targetWord: note.targetWord,
      notes: note.notes,
      alternativePhrasing: note.alternativePhrasing,
      sourceType: note.sourceType as NoteSourceType,
      isArchived: note.isArchived,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      cards: (note.cards || [])
        .filter((c) => c.isActive)
        .map((c) => this.mapCardToResponse(c)),
    };
  }

  private mapCardToResponse(
    card: Prisma.LearningCardGetPayload<object>,
  ): LearningCardResponse {
    return {
      id: card.id,
      noteId: card.noteId,
      cardType: card.cardType as CardType,
      front: card.front,
      back: card.back,
      clozeIndex: card.clozeIndex,
      state: card.state as CardState,
      dueAt: card.dueAt,
      difficulty: card.difficulty,
      lapseCount: card.lapseCount,
    };
  }
}
