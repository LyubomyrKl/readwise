import { SchedulerService } from './scheduler.service';
import { ReviewRating, CardState } from '../learning.models';

describe('SchedulerService', () => {
  let scheduler: SchedulerService;

  beforeEach(() => {
    scheduler = new SchedulerService();
  });

  describe('calculateSchedule', () => {
    const baseCard = {
      difficulty: 0.3,
      stability: 1.0,
      state: CardState.REVIEW,
      lapseCount: 0,
      reviewCount: 5,
    };

    it('should increase difficulty on AGAIN rating', () => {
      const result = scheduler.calculateSchedule(baseCard, {
        rating: ReviewRating.AGAIN,
        responseTimeMs: 5000,
        wasHesitant: false,
      });

      expect(result.newDifficulty).toBeGreaterThan(baseCard.difficulty);
      expect(result.newState).toBe(CardState.RELEARNING);
    });

    it('should decrease difficulty on EASY rating', () => {
      const result = scheduler.calculateSchedule(baseCard, {
        rating: ReviewRating.EASY,
        responseTimeMs: 2000,
        wasHesitant: false,
      });

      expect(result.newDifficulty).toBeLessThan(baseCard.difficulty);
    });

    it('should increase stability on successful review', () => {
      const result = scheduler.calculateSchedule(baseCard, {
        rating: ReviewRating.GOOD,
        responseTimeMs: 4000,
        wasHesitant: false,
      });

      expect(result.newStability).toBeGreaterThan(baseCard.stability);
    });

    it('should decrease stability on failed review', () => {
      const result = scheduler.calculateSchedule(baseCard, {
        rating: ReviewRating.AGAIN,
        responseTimeMs: 5000,
        wasHesitant: false,
      });

      expect(result.newStability).toBeLessThan(baseCard.stability);
    });

    it('should give bonus for fast correct answers', () => {
      const fastResult = scheduler.calculateSchedule(baseCard, {
        rating: ReviewRating.GOOD,
        responseTimeMs: 1500, // Fast
        wasHesitant: false,
      });

      const slowResult = scheduler.calculateSchedule(baseCard, {
        rating: ReviewRating.GOOD,
        responseTimeMs: 12000, // Slow
        wasHesitant: false,
      });

      // Fast answers should result in lower difficulty
      expect(fastResult.newDifficulty).toBeLessThan(slowResult.newDifficulty);
    });

    it('should penalize hesitant answers', () => {
      const hesitantResult = scheduler.calculateSchedule(baseCard, {
        rating: ReviewRating.GOOD,
        responseTimeMs: 5000,
        wasHesitant: true,
      });

      const confidentResult = scheduler.calculateSchedule(baseCard, {
        rating: ReviewRating.GOOD,
        responseTimeMs: 5000,
        wasHesitant: false,
      });

      expect(hesitantResult.newDifficulty).toBeGreaterThan(
        confidentResult.newDifficulty,
      );
    });

    it('should graduate new cards after GOOD rating', () => {
      const newCard = {
        ...baseCard,
        state: CardState.NEW,
      };

      const result = scheduler.calculateSchedule(newCard, {
        rating: ReviewRating.GOOD,
        responseTimeMs: 5000,
        wasHesitant: false,
      });

      expect(result.newState).toBe(CardState.REVIEW);
    });

    it('should keep learning cards in learning on HARD rating', () => {
      const learningCard = {
        ...baseCard,
        state: CardState.LEARNING,
      };

      const result = scheduler.calculateSchedule(learningCard, {
        rating: ReviewRating.HARD,
        responseTimeMs: 5000,
        wasHesitant: false,
      });

      expect(result.newState).toBe(CardState.LEARNING);
    });

    it('should cap interval at 365 days', () => {
      const highStabilityCard = {
        ...baseCard,
        stability: 500, // Very high stability
      };

      const result = scheduler.calculateSchedule(highStabilityCard, {
        rating: ReviewRating.EASY,
        responseTimeMs: 2000,
        wasHesitant: false,
      });

      expect(result.intervalDays).toBeLessThanOrEqual(365);
    });

    it('should set short interval for learning cards with HARD', () => {
      const learningCard = {
        ...baseCard,
        state: CardState.LEARNING,
      };

      const result = scheduler.calculateSchedule(learningCard, {
        rating: ReviewRating.HARD,
        responseTimeMs: 5000,
        wasHesitant: false,
      });

      // HARD in learning keeps it in learning with short interval
      expect(result.newState).toBe(CardState.LEARNING);
      expect(result.intervalDays).toBeLessThan(1);
    });
  });

  describe('calculateRetrievability', () => {
    it('should return 1 for just-reviewed cards', () => {
      const result = scheduler.calculateRetrievability(1.0, 0);
      expect(result).toBeCloseTo(1, 2);
    });

    it('should decrease over time', () => {
      const day1 = scheduler.calculateRetrievability(1.0, 1);
      const day7 = scheduler.calculateRetrievability(1.0, 7);
      const day30 = scheduler.calculateRetrievability(1.0, 30);

      expect(day7).toBeLessThan(day1);
      expect(day30).toBeLessThan(day7);
    });

    it('should retain better with higher stability', () => {
      const lowStability = scheduler.calculateRetrievability(1.0, 10);
      const highStability = scheduler.calculateRetrievability(5.0, 10);

      expect(highStability).toBeGreaterThan(lowStability);
    });
  });

  describe('detectImbalance', () => {
    it('should detect significant imbalance', () => {
      const result = scheduler.detectImbalance(0.9, 0.6);

      expect(result.hasImbalance).toBe(true);
      expect(result.recommendation).toContain('production');
    });

    it('should not flag small differences', () => {
      const result = scheduler.detectImbalance(0.85, 0.82);

      expect(result.hasImbalance).toBe(false);
    });
  });

  describe('shouldThrottleNewCards', () => {
    it('should throttle when many lapses', () => {
      expect(scheduler.shouldThrottleNewCards(10, 0.8, 50)).toBe(true);
    });

    it('should throttle when low correct rate', () => {
      expect(scheduler.shouldThrottleNewCards(2, 0.6, 30)).toBe(true);
    });

    it('should throttle when high cognitive load', () => {
      expect(scheduler.shouldThrottleNewCards(2, 0.85, 80)).toBe(true);
    });

    it('should not throttle under normal conditions', () => {
      expect(scheduler.shouldThrottleNewCards(2, 0.85, 40)).toBe(false);
    });
  });

  describe('calculateCognitiveLoad', () => {
    it('should return higher load for more lapses', () => {
      const lowLapses = scheduler.calculateCognitiveLoad(10, 5, 1, 0.3);
      const highLapses = scheduler.calculateCognitiveLoad(10, 5, 10, 0.3);

      expect(highLapses).toBeGreaterThan(lowLapses);
    });

    it('should weight new cards heavily', () => {
      const fewNew = scheduler.calculateCognitiveLoad(20, 2, 0, 0.3);
      const manyNew = scheduler.calculateCognitiveLoad(20, 10, 0, 0.3);

      expect(manyNew).toBeGreaterThan(fewNew);
    });

    it('should cap at 100', () => {
      const result = scheduler.calculateCognitiveLoad(500, 50, 30, 0.9);
      expect(result).toBeLessThanOrEqual(100);
    });
  });
});
