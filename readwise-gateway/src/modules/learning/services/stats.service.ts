import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { SchedulerService } from './scheduler.service';
import {
  StatsResponse,
  DailyStatsResponse,
  CardType,
} from '../learning.models';

// Simple in-memory cache entry
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class StatsService {
  // Thresholds
  private readonly MATURE_STABILITY_DAYS = 21;
  private readonly RETENTION_WINDOW_DAYS = 30;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // Simple in-memory cache for stats
  private statsCache = new Map<string, CacheEntry<StatsResponse>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  /**
   * Get comprehensive learning statistics for a user.
   * Results are cached for 5 minutes to reduce database load.
   */
  async getStats(userId: string, bypassCache = false): Promise<StatsResponse> {
    // Check cache first
    if (!bypassCache) {
      const cached = this.statsCache.get(userId);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
    }

    // Run all independent queries in parallel
    const [
      cardCounts,
      reviewStats,
      streak,
      forecast,
      cognitiveLoad,
    ] = await Promise.all([
      this.getCardCounts(userId),
      this.getReviewStatsOptimized(userId),
      this.calculateStreak(userId),
      this.getReviewForecastOptimized(userId),
      this.calculateCognitiveLoad(userId),
    ]);

    // Detect recognition/production imbalance
    const imbalance = this.scheduler.detectImbalance(
      reviewStats.recognitionAccuracy,
      reviewStats.productionAccuracy,
    );

    // Estimate usable vocabulary (mature + 50% of young)
    const estimatedUsableVocabulary = Math.round(
      cardCounts.mature + cardCounts.young * 0.5,
    );

    const stats: StatsResponse = {
      retentionRate: reviewStats.retentionRate,
      matureVocabulary: cardCounts.mature,
      youngVocabulary: cardCounts.young,
      newCards: cardCounts.new,
      productionAccuracy: reviewStats.productionAccuracy,
      estimatedUsableVocabulary,
      dailyCognitiveLoad: cognitiveLoad,
      currentStreak: streak,
      reviewsForecast: forecast,
      imbalanceWarning: imbalance.hasImbalance
        ? imbalance.recommendation
        : undefined,
    };

    // Cache the result
    this.statsCache.set(userId, {
      data: stats,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });

    return stats;
  }

  /**
   * Invalidate the stats cache for a user.
   * Call this after reviews are submitted.
   */
  invalidateCache(userId: string): void {
    this.statsCache.delete(userId);
  }

  /**
   * Combined review stats query - reduces 3 queries to 1 raw query
   */
  private async getReviewStatsOptimized(userId: string): Promise<{
    retentionRate: number;
    recognitionAccuracy: number;
    productionAccuracy: number;
  }> {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - this.RETENTION_WINDOW_DAYS);

    type ReviewStatsRow = {
      card_type: string | null;
      total: bigint;
      successful: bigint;
    };

    // Single query to get all review stats grouped by card type
    const results = await this.prisma.$queryRaw<ReviewStatsRow[]>`
      SELECT
        c."cardType" as card_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE r.rating != 'again') as successful
      FROM "CardReview" r
      LEFT JOIN "LearningCard" c ON r."cardId" = c.id
      WHERE r."userId" = ${userId}
        AND r."reviewedAt" >= ${windowStart}
      GROUP BY c."cardType"
    `;

    let totalReviews = 0;
    let totalSuccessful = 0;
    let productionTotal = 0;
    let productionSuccessful = 0;
    let recognitionTotal = 0;
    let recognitionSuccessful = 0;

    for (const row of results) {
      const total = Number(row.total);
      const successful = Number(row.successful);

      totalReviews += total;
      totalSuccessful += successful;

      if (row.card_type === 'production') {
        productionTotal = total;
        productionSuccessful = successful;
      } else if (row.card_type === 'recognition') {
        recognitionTotal = total;
        recognitionSuccessful = successful;
      }
    }

    return {
      retentionRate: totalReviews > 0
        ? Math.round((totalSuccessful / totalReviews) * 100) / 100
        : 0,
      recognitionAccuracy: recognitionTotal > 0
        ? Math.round((recognitionSuccessful / recognitionTotal) * 100) / 100
        : 0,
      productionAccuracy: productionTotal > 0
        ? Math.round((productionSuccessful / productionTotal) * 100) / 100
        : 0,
    };
  }

  /**
   * Optimized forecast query - single query instead of 7
   */
  private async getReviewForecastOptimized(userId: string): Promise<number[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7);

    type ForecastRow = {
      day_offset: number;
      count: bigint;
    };

    // Single query to get all 7 days of forecast
    const results = await this.prisma.$queryRaw<ForecastRow[]>`
      SELECT
        DATE_PART('day', "dueAt"::date - ${today}::date)::int as day_offset,
        COUNT(*) as count
      FROM "LearningCard"
      WHERE "userId" = ${userId}
        AND "isActive" = true
        AND "dueAt" >= ${today}
        AND "dueAt" < ${endDate}
      GROUP BY day_offset
      ORDER BY day_offset
    `;

    // Build forecast array
    const forecast = [0, 0, 0, 0, 0, 0, 0];
    for (const row of results) {
      if (row.day_offset >= 0 && row.day_offset < 7) {
        forecast[row.day_offset] = Number(row.count);
      }
    }

    return forecast;
  }

  /**
   * Get card counts by maturity level
   */
  private async getCardCounts(
    userId: string,
  ): Promise<{ mature: number; young: number; new: number }> {
    const cards = await this.prisma.learningCard.findMany({
      where: { userId, isActive: true },
      select: { stability: true, state: true },
    });

    let young = 0;
    let newCount = 0;

    for (const card of cards) {
      if (card.state === 'new') {
        newCount++;
      } else if (card.stability < this.MATURE_STABILITY_DAYS) {
        young++;
      }
    }

    // Count by unique notes (not cards)
    const matureNotes = await this.prisma.learningCard.groupBy({
      by: ['noteId'],
      where: {
        userId,
        isActive: true,
        stability: { gte: this.MATURE_STABILITY_DAYS },
      },
    });

    return {
      mature: matureNotes.length,
      young,
      new: newCount,
    };
  }

  /**
   * Calculate rolling retention rate over the past 30 days
   */
  private async calculateRetentionRate(
    userId: string,
  ): Promise<{ rate: number }> {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - this.RETENTION_WINDOW_DAYS);

    const reviews = await this.prisma.cardReview.findMany({
      where: {
        userId,
        reviewedAt: { gte: windowStart },
      },
      select: { rating: true },
    });

    if (reviews.length === 0) {
      return { rate: 0 };
    }

    const successfulReviews = reviews.filter(
      (r) => r.rating !== 'again',
    ).length;

    return {
      rate: Math.round((successfulReviews / reviews.length) * 100) / 100,
    };
  }

  /**
   * Calculate production card accuracy
   */
  private async calculateProductionAccuracy(
    userId: string,
  ): Promise<{ accuracy: number }> {
    return this.calculateCardTypeAccuracy(userId, CardType.PRODUCTION).then(
      (accuracy) => ({ accuracy }),
    );
  }

  /**
   * Calculate accuracy for a specific card type
   */
  private async calculateCardTypeAccuracy(
    userId: string,
    cardType: CardType,
  ): Promise<number> {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - this.RETENTION_WINDOW_DAYS);

    const reviews = await this.prisma.cardReview.findMany({
      where: {
        userId,
        reviewedAt: { gte: windowStart },
        card: { cardType },
      },
      select: { rating: true },
    });

    if (reviews.length === 0) {
      return 0;
    }

    const successful = reviews.filter((r) => r.rating !== 'again').length;
    return Math.round((successful / reviews.length) * 100) / 100;
  }

  /**
   * Calculate current study streak
   */
  private async calculateStreak(userId: string): Promise<number> {
    const sessions = await this.prisma.learningSession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
      take: 365, // Max 1 year lookback
    });

    if (sessions.length === 0) {
      return 0;
    }

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if studied today or yesterday (to maintain streak)
    const lastStudy = new Date(sessions[0].startedAt);
    lastStudy.setHours(0, 0, 0, 0);

    const daysSinceLastStudy = Math.floor(
      (today.getTime() - lastStudy.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (daysSinceLastStudy > 1) {
      return 0; // Streak broken
    }

    // Count consecutive days
    const studyDates = new Set(
      sessions.map((s) => {
        const d = new Date(s.startedAt);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      }),
    );

    const checkDate = new Date(lastStudy);
    while (true) {
      const dateKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
      if (studyDates.has(dateKey)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    return streak;
  }

  /**
   * Get review forecast for next 7 days
   */
  private async getReviewForecast(userId: string): Promise<number[]> {
    const forecast: number[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(today);
      dayStart.setDate(dayStart.getDate() + i);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dueCount = await this.prisma.learningCard.count({
        where: {
          userId,
          isActive: true,
          dueAt: {
            gte: dayStart,
            lt: dayEnd,
          },
        },
      });

      forecast.push(dueCount);
    }

    return forecast;
  }

  /**
   * Calculate current cognitive load
   */
  private async calculateCognitiveLoad(userId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [dueCards, , todayLapses, avgDifficulty] =
      await Promise.all([
        this.prisma.learningCard.count({
          where: {
            userId,
            isActive: true,
            dueAt: { lte: new Date() },
          },
        }),
        this.prisma.cardReview.count({
          where: {
            userId,
            reviewedAt: { gte: today },
          },
        }),
        this.prisma.cardReview.count({
          where: {
            userId,
            reviewedAt: { gte: today },
            rating: 'again',
          },
        }),
        this.prisma.learningCard.aggregate({
          where: { userId, isActive: true },
          _avg: { difficulty: true },
        }),
      ]);

    const newCardsToday = await this.prisma.learningCard.count({
      where: {
        userId,
        state: 'new',
        createdAt: { gte: today },
      },
    });

    return this.scheduler.calculateCognitiveLoad(
      dueCards,
      newCardsToday,
      todayLapses,
      avgDifficulty._avg.difficulty || 0.3,
    );
  }

  /**
   * Get daily statistics breakdown
   */
  async getDailyStats(userId: string, days: number = 30): Promise<DailyStatsResponse[]> {
    const results: DailyStatsResponse[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < days; i++) {
      const dayStart = new Date(today);
      dayStart.setDate(dayStart.getDate() - i);

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const [reviews, sessions] = await Promise.all([
        this.prisma.cardReview.findMany({
          where: {
            userId,
            reviewedAt: { gte: dayStart, lt: dayEnd },
          },
          include: { card: { select: { state: true } } },
        }),
        this.prisma.learningSession.findMany({
          where: {
            userId,
            startedAt: { gte: dayStart, lt: dayEnd },
          },
        }),
      ]);

      const newCardsStudied = reviews.filter(
        (r) => r.previousState === 'new',
      ).length;
      const correctCount = reviews.filter((r) => r.rating !== 'again').length;
      const timeSpent = sessions.reduce((sum, s) => sum + s.totalTimeMs, 0);

      results.push({
        date: dayStart.toISOString().split('T')[0],
        newCardsStudied,
        reviewsCompleted: reviews.length,
        correctCount,
        incorrectCount: reviews.length - correctCount,
        timeSpentMs: timeSpent,
      });
    }

    return results.reverse(); // Chronological order
  }

  /**
   * Update aggregated stats (called after reviews)
   */
  async updateStats(userId: string): Promise<void> {
    const [cardCounts, retention, productionAcc, streak] = await Promise.all([
      this.getCardCounts(userId),
      this.calculateRetentionRate(userId),
      this.calculateProductionAccuracy(userId),
      this.calculateStreak(userId),
    ]);

    const avgResponseTime = await this.prisma.cardReview.aggregate({
      where: { userId },
      _avg: { responseTimeMs: true },
    });

    const cognitiveLoad = await this.calculateCognitiveLoad(userId);

    // Upsert user learning stats
    await this.prisma.userLearningStats.upsert({
      where: { userId },
      update: {
        totalNotes: await this.prisma.learningNote.count({
          where: { userId, deletedAt: null },
        }),
        matureCards: cardCounts.mature,
        youngCards: cardCounts.young,
        retentionRate: retention.rate,
        productionAccuracy: productionAcc.accuracy,
        avgResponseTime: avgResponseTime._avg.responseTimeMs || 0,
        currentStreak: streak,
        lastStudyDate: new Date(),
        currentLoadScore: cognitiveLoad,
      },
      create: {
        userId,
        totalNotes: await this.prisma.learningNote.count({
          where: { userId, deletedAt: null },
        }),
        matureCards: cardCounts.mature,
        youngCards: cardCounts.young,
        retentionRate: retention.rate,
        productionAccuracy: productionAcc.accuracy,
        avgResponseTime: avgResponseTime._avg.responseTimeMs || 0,
        currentStreak: streak,
        longestStreak: streak,
        lastStudyDate: new Date(),
        currentLoadScore: cognitiveLoad,
      },
    });
  }
}
