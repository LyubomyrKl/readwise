import { CardGeneratorService } from './card-generator.service';
import { CardType, CardSourceType } from '../learning.models';

describe('CardGeneratorService', () => {
  let generator: CardGeneratorService;

  beforeEach(() => {
    generator = new CardGeneratorService();
  });

  const baseNote = {
    id: 'note-1',
    targetSentence: 'The cat quickly ran across the street.',
    meaning: 'To move fast with legs',
    targetWord: 'ran',
    notes: 'Past tense of run',
    alternativePhrasing: 'sprinted, rushed',
  };

  describe('generateCards', () => {
    it('should generate only production card by default', () => {
      const cards = generator.generateCards(baseNote, {
        generateRecognition: false,
        generateProduction: true,
        generateCloze: false,
      });

      expect(cards).toHaveLength(1);
      expect(cards[0].cardType).toBe(CardType.PRODUCTION);
    });

    it('should generate recognition card when production is disabled', () => {
      const cards = generator.generateCards(baseNote, {
        generateRecognition: true,
        generateProduction: false,
        generateCloze: false,
      });

      expect(cards).toHaveLength(1);
      expect(cards[0].cardType).toBe(CardType.RECOGNITION);
    });

    it('should only generate production when both are enabled', () => {
      const cards = generator.generateCards(baseNote, {
        generateRecognition: true,
        generateProduction: true,
        generateCloze: false,
      });

      // Should not generate both - production takes priority
      expect(cards).toHaveLength(1);
      expect(cards[0].cardType).toBe(CardType.PRODUCTION);
    });

    it('should default to production when nothing is enabled', () => {
      const cards = generator.generateCards(baseNote, {
        generateRecognition: false,
        generateProduction: false,
        generateCloze: false,
      });

      expect(cards).toHaveLength(1);
      expect(cards[0].cardType).toBe(CardType.PRODUCTION);
    });
  });

  describe('production card generation', () => {
    it('should mask the target word in the sentence', () => {
      const cards = generator.generateCards(baseNote, {
        generateRecognition: false,
        generateProduction: true,
        generateCloze: false,
      });

      expect(cards[0].front).toContain('____');
      expect(cards[0].front).not.toContain('ran');
    });

    it('should include meaning in front', () => {
      const cards = generator.generateCards(baseNote, {
        generateRecognition: false,
        generateProduction: true,
        generateCloze: false,
      });

      expect(cards[0].front).toContain(baseNote.meaning);
    });

    it('should include target word in back', () => {
      const cards = generator.generateCards(baseNote, {
        generateRecognition: false,
        generateProduction: true,
        generateCloze: false,
      });

      expect(cards[0].back).toContain(baseNote.targetWord);
    });

    it('should include notes in back', () => {
      const cards = generator.generateCards(baseNote, {
        generateRecognition: false,
        generateProduction: true,
        generateCloze: false,
      });

      expect(cards[0].back).toContain(baseNote.notes);
    });

    it('should include alternative phrasing in back', () => {
      const cards = generator.generateCards(baseNote, {
        generateRecognition: false,
        generateProduction: true,
        generateCloze: false,
      });

      expect(cards[0].back).toContain(baseNote.alternativePhrasing);
    });
  });

  describe('recognition card generation', () => {
    it('should highlight the target word', () => {
      const cards = generator.generateCards(baseNote, {
        generateRecognition: true,
        generateProduction: false,
        generateCloze: false,
      });

      expect(cards[0].front).toContain('**ran**');
    });

    it('should include meaning in back', () => {
      const cards = generator.generateCards(baseNote, {
        generateRecognition: true,
        generateProduction: false,
        generateCloze: false,
      });

      expect(cards[0].back).toContain(baseNote.meaning);
    });
  });

  describe('dictionary source type', () => {
    it('should format production card differently for dictionary', () => {
      const cards = generator.generateCards(baseNote, {
        generateRecognition: false,
        generateProduction: true,
        generateCloze: false,
        sourceType: CardSourceType.DICTIONARY,
      });

      // Dictionary cards show definition → word
      expect(cards[0].front).toContain(baseNote.meaning);
      expect(cards[0].back).toContain(baseNote.targetWord);
    });

    it('should format recognition card differently for dictionary', () => {
      const cards = generator.generateCards(baseNote, {
        generateRecognition: true,
        generateProduction: false,
        generateCloze: false,
        sourceType: CardSourceType.DICTIONARY,
      });

      // Dictionary recognition: word → definition
      expect(cards[0].front).toBe(baseNote.targetWord);
      expect(cards[0].back).toContain(baseNote.meaning);
    });
  });

  describe('word masking', () => {
    it('should mask word variations', () => {
      const note = {
        id: 'note-2',
        targetSentence: 'She is running very fast.',
        meaning: 'To move quickly',
        targetWord: 'run',
      };

      const cards = generator.generateCards(note, {
        generateRecognition: false,
        generateProduction: true,
        generateCloze: false,
      });

      expect(cards[0].front).toContain('____');
      expect(cards[0].front).not.toContain('running');
    });

    it('should handle words not found in sentence', () => {
      const note = {
        id: 'note-3',
        targetSentence: 'The dog barked loudly.',
        meaning: 'A feline animal',
        targetWord: 'cat',
      };

      const cards = generator.generateCards(note, {
        generateRecognition: false,
        generateProduction: true,
        generateCloze: false,
      });

      // Production card front shows meaning (context not shown if word not masked)
      expect(cards[0].front).toContain('A feline animal');
      // Back should contain the target word and original sentence
      expect(cards[0].back).toContain('cat');
      expect(cards[0].back).toContain('The dog barked loudly.');
    });

    it('should mask all occurrences of the word', () => {
      const note = {
        id: 'note-4',
        targetSentence: 'The run was a long run.',
        meaning: 'To move quickly',
        targetWord: 'run',
      };

      const cards = generator.generateCards(note, {
        generateRecognition: false,
        generateProduction: true,
        generateCloze: false,
      });

      const front = cards[0].front;
      expect((front.match(/____/g) || []).length).toBe(2);
    });
  });

  describe('word highlighting', () => {
    it('should highlight with markdown bold', () => {
      const cards = generator.generateCards(baseNote, {
        generateRecognition: true,
        generateProduction: false,
        generateCloze: false,
      });

      expect(cards[0].front).toMatch(/\*\*ran\*\*/);
    });

    it('should handle case-insensitive highlighting', () => {
      const note = {
        id: 'note-5',
        targetSentence: 'HELLO, world!',
        meaning: 'A greeting',
        targetWord: 'hello',
      };

      const cards = generator.generateCards(note, {
        generateRecognition: true,
        generateProduction: false,
        generateCloze: false,
      });

      expect(cards[0].front).toMatch(/\*\*HELLO\*\*/);
    });
  });
});
