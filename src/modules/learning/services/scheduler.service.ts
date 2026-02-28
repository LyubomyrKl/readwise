import { Injectable } from '@nestjs/common';
import { ReviewRating, CardState } from '../learning.models';

interface CardParams {
  difficulty: number;
  stability: number;
  state: CardState;
  lapseCount: number;
  reviewCount: number;
}

interface ReviewInput {
  rating: ReviewRating;
  responseTimeMs: number;
  wasHesitant: boolean;
}

export interface ScheduleResult {
  newDifficulty: number;
  newStability: number;
  newState: CardState;
  intervalDays: number;
  nextDueAt: Date;
}

@Injectable()
export class SchedulerService {
  // FSRS algorithm constants
  private readonly INITIAL_STABILITY = 0.4;
  private readonly INITIAL_DIFFICULTY = 0.3;
  private readonly DECAY = -0.5;
  private readonly FACTOR = 0.9;
  private readonly TARGET_RETENTION = 0.9;
  private readonly MAX_INTERVAL_DAYS = 365; // Cap intervals at 1 year

  // Response time thresholds (ms)
  private readonly FAST_THRESHOLD = 3000; // < 3s = fast
  private readonly SLOW_THRESHOLD = 10000; // > 10s = slow
  private readonly HESITANT_THRESHOLD = 8000; // > 8s = hesitant

  // Difficulty adjustment factors
  private readonly D_INCREASE_AGAIN = 0.15;
  private readonly D_INCREASE_HARD = 0.05;
  private readonly D_DECREASE_GOOD = -0.02;
  private readonly D_DECREASE_EASY = -0.1;

  // Stability multipliers per rating
  private readonly S_MULTIPLIER_AGAIN = 0.2;
  private readonly S_MULTIPLIER_HARD = 1.2;
  private readonly S_MULTIPLIER_GOOD = 2.5;
  private readonly S_MULTIPLIER_EASY = 3.5;

  /**
   * Calculate next review schedule based on FSRS-inspired algorithm
   * Incorporates response time for anti-illusion detection
   */
  calculateSchedule(card: CardParams, review: ReviewInput): ScheduleResult {
    // Calculate time-based adjustment
    const timeAdjustment = this.calculateTimeAdjustment(review);

    // Update difficulty based on rating and time
    const newDifficulty = this.clamp(
      this.updateDifficulty(card.difficulty, review.rating, timeAdjustment),
      0,
      1,
    );

    // Calculate new stability
    const newStability = Math.max(
      0.1,
      this.updateStability(
        card.stability,
        review.rating,
        newDifficulty,
        timeAdjustment,
      ),
    );

    // Determine new state
    const newState = this.determineState(card.state, review.rating, card.lapseCount);

    // Calculate interval with cap
    const rawInterval = this.calculateInterval(newStability, newState, review.rating);
    const intervalDays = Math.min(
      this.MAX_INTERVAL_DAYS,
      Math.max(
        this.getMinInterval(newState),
        Math.round(rawInterval),
      ),
    );

    // Calculate next due date
    const nextDueAt = new Date();
    nextDueAt.setTime(nextDueAt.getTime() + intervalDays * 24 * 60 * 60 * 1000);

    return {
      newDifficulty,
      newStability,
      newState,
      intervalDays,
      nextDueAt,
    };
  }

  /**
   * Calculate time-based adjustment factor
   * Fast + correct = bonus, slow/hesitant = penalty
   */
  private calculateTimeAdjustment(review: ReviewInput): number {
    const { responseTimeMs, wasHesitant, rating } = review;

    // Explicit hesitation always penalizes
    if (wasHesitant) {
      return -0.15;
    }

    // Auto-detect hesitation from response time
    if (responseTimeMs > this.HESITANT_THRESHOLD && rating !== ReviewRating.AGAIN) {
      return -0.1;
    }

    // Fast correct answers get bonus (reward confidence)
    if (rating !== ReviewRating.AGAIN && responseTimeMs < this.FAST_THRESHOLD) {
      return 0.1;
    }

    // Slow but correct answers get slight penalty
    if (rating !== ReviewRating.AGAIN && responseTimeMs > this.SLOW_THRESHOLD) {
      return -0.05;
    }

    return 0;
  }

  /**
   * Update difficulty based on rating and time adjustment
   */
  private updateDifficulty(
    current: number,
    rating: ReviewRating,
    timeAdj: number,
  ): number {
    let delta = 0;

    switch (rating) {
      case ReviewRating.AGAIN:
        delta = this.D_INCREASE_AGAIN;
        break;
      case ReviewRating.HARD:
        delta = this.D_INCREASE_HARD;
        break;
      case ReviewRating.GOOD:
        delta = this.D_DECREASE_GOOD;
        break;
      case ReviewRating.EASY:
        delta = this.D_DECREASE_EASY;
        break;
    }

    // Time adjustment modifies difficulty change
    // Slow/hesitant makes cards seem harder
    delta -= timeAdj * 0.05;

    return current + delta;
  }

  /**
   * Update stability (memory strength) based on review outcome
   */
  private updateStability(
    current: number,
    rating: ReviewRating,
    difficulty: number,
    timeAdj: number,
  ): number {
    // Failed review: significant stability loss
    if (rating === ReviewRating.AGAIN) {
      return current * this.S_MULTIPLIER_AGAIN;
    }

    // Get base multiplier for success levels
    const baseMultiplier = {
      [ReviewRating.HARD]: this.S_MULTIPLIER_HARD,
      [ReviewRating.GOOD]: this.S_MULTIPLIER_GOOD,
      [ReviewRating.EASY]: this.S_MULTIPLIER_EASY,
      [ReviewRating.AGAIN]: 1, // Won't reach here
    }[rating];

    // Difficulty reduces growth (harder cards grow slower)
    const difficultyFactor = 1 - difficulty * 0.5;

    // Time adjustment affects growth
    const timeFactor = 1 + timeAdj;

    return current * baseMultiplier * difficultyFactor * timeFactor;
  }

  /**
   * Determine new card state based on review outcome
   */
  private determineState(
    current: CardState,
    rating: ReviewRating,
    _lapseCount: number,
  ): CardState {
    // Any failure puts card into learning/relearning
    if (rating === ReviewRating.AGAIN) {
      return current === CardState.NEW ? CardState.LEARNING : CardState.RELEARNING;
    }

    // New or learning cards
    if (current === CardState.NEW || current === CardState.LEARNING) {
      // Graduate to review after good/easy
      if (rating === ReviewRating.GOOD || rating === ReviewRating.EASY) {
        return CardState.REVIEW;
      }
      // Hard keeps in learning
      return CardState.LEARNING;
    }

    // Relearning cards need good/easy to graduate back
    if (current === CardState.RELEARNING) {
      if (rating === ReviewRating.GOOD || rating === ReviewRating.EASY) {
        return CardState.REVIEW;
      }
      return CardState.RELEARNING;
    }

    // Review cards stay in review
    return CardState.REVIEW;
  }

  /**
   * Calculate interval based on stability and state
   */
  private calculateInterval(
    stability: number,
    state: CardState,
    rating: ReviewRating,
  ): number {
    // Learning/relearning cards: short intervals in days
    if (state === CardState.LEARNING || state === CardState.RELEARNING) {
      switch (rating) {
        case ReviewRating.AGAIN:
          return 0.007; // ~10 minutes
        case ReviewRating.HARD:
          return 0.042; // ~1 hour
        case ReviewRating.GOOD:
          return 0.5; // 12 hours
        case ReviewRating.EASY:
          return 1; // 1 day
      }
    }

    // Review cards: stability-based interval
    // Formula: I = S * ln(target_R) / ln(0.9)
    // This gives us the number of days until retention drops to target
    const interval =
      stability * (Math.log(this.TARGET_RETENTION) / Math.log(0.9));

    return interval;
  }

  /**
   * Get minimum interval for a state
   */
  private getMinInterval(state: CardState): number {
    switch (state) {
      case CardState.NEW:
      case CardState.LEARNING:
        return 0.007; // 10 minutes
      case CardState.RELEARNING:
        return 0.007; // 10 minutes
      case CardState.REVIEW:
        return 1; // 1 day minimum for review cards
    }
  }

  /**
   * Calculate retrievability (probability of recall) at a given time
   */
  calculateRetrievability(stability: number, daysSinceReview: number): number {
    // R(t) = (1 + t/(9*S))^(-0.5)
    return Math.pow(1 + daysSinceReview / (9 * stability), this.DECAY);
  }

  /**
   * Detect recognition/production imbalance
   * Returns warning if recognition accuracy significantly exceeds production
   */
  detectImbalance(
    recognitionAccuracy: number,
    productionAccuracy: number,
  ): { hasImbalance: boolean; recommendation: string } {
    const gap = recognitionAccuracy - productionAccuracy;

    if (gap > 0.2) {
      return {
        hasImbalance: true,
        recommendation:
          'Recognition is strong but production is weak. Prioritizing production cards to build active fluency.',
      };
    }

    if (gap > 0.1) {
      return {
        hasImbalance: true,
        recommendation:
          'Slight imbalance detected between recognition and production. Consider focusing more on production practice.',
      };
    }

    return { hasImbalance: false, recommendation: '' };
  }

  /**
   * Calculate cognitive load score for throttling
   * Returns 0-100 scale
   */
  calculateCognitiveLoad(
    dueReviews: number,
    newCardsToday: number,
    lapsesToday: number,
    avgDifficulty: number,
  ): number {
    // Weighted sum of factors
    const reviewWeight = dueReviews * 1;
    const newWeight = newCardsToday * 3; // New cards are mentally taxing
    const lapseWeight = lapsesToday * 5; // Lapses indicate overload
    const difficultyMultiplier = 1 + avgDifficulty;

    const rawLoad =
      ((reviewWeight + newWeight + lapseWeight) * difficultyMultiplier) / 10;

    return Math.min(100, Math.round(rawLoad));
  }

  /**
   * Determine if new cards should be throttled based on recent performance
   */
  shouldThrottleNewCards(
    lapsesToday: number,
    correctRate: number,
    cognitiveLoad: number,
  ): boolean {
    // Throttle if many lapses today
    if (lapsesToday > 5) return true;

    // Throttle if correct rate dropped significantly
    if (correctRate < 0.7) return true;

    // Throttle if cognitive load is high
    if (cognitiveLoad > 70) return true;

    return false;
  }

  /**
   * Helper: clamp value between min and max
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
