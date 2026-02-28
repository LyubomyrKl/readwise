import { Injectable } from '@nestjs/common';
import { CardType, CardSourceType } from '../learning.models';

interface NoteData {
  id: string;
  targetSentence: string;
  meaning: string;
  targetWord: string;
  notes?: string | null;
  alternativePhrasing?: string | null;
}

export interface GeneratedCard {
  cardType: CardType;
  front: string;
  back: string;
}

export interface GenerationSettings {
  generateRecognition: boolean;
  generateProduction: boolean;
  generateCloze: boolean; // Deprecated - ignored
  sourceType?: CardSourceType;
}

/**
 * Simplified Card Generation:
 *
 * ONE NOTE = ONE CARD (by default)
 *
 * We generate PRODUCTION cards because active recall is what builds memory.
 * Recognition cards are optional and should be used sparingly.
 * Cloze cards are redundant with production and removed.
 *
 * The card tests: "Given the meaning, can you recall the word?"
 */
@Injectable()
export class CardGeneratorService {
  generateCards(note: NoteData, settings: GenerationSettings): GeneratedCard[] {
    const cards: GeneratedCard[] = [];
    const sourceType = settings.sourceType ?? CardSourceType.SENTENCE;

    // Production card is the primary learning tool (active recall)
    if (settings.generateProduction) {
      cards.push(this.generateProductionCard(note, sourceType));
    }

    // Recognition is secondary - only if explicitly enabled AND no production
    // Having both for same word is wasteful
    if (settings.generateRecognition && !settings.generateProduction) {
      cards.push(this.generateRecognitionCard(note, sourceType));
    }

    // If nothing enabled, default to production
    if (cards.length === 0) {
      cards.push(this.generateProductionCard(note, sourceType));
    }

    return cards;
  }

  /**
   * PRODUCTION CARD (Primary)
   *
   * Tests active recall: See meaning → produce the word
   * This is the most effective way to learn vocabulary.
   */
  private generateProductionCard(note: NoteData, sourceType: CardSourceType): GeneratedCard {
    const masked = this.maskWord(note.targetSentence, note.targetWord);
    const hasMaskedContext = masked !== note.targetSentence;

    let front: string;
    let back: string;

    if (sourceType === CardSourceType.DICTIONARY) {
      // Dictionary: Definition → Word
      front = note.meaning;
      if (hasMaskedContext) {
        front += `\n\n"${masked}"`;
      }

      back = note.targetWord;
      if (note.targetSentence) {
        back += `\n\n"${note.targetSentence}"`;
      }
    } else {
      // Sentence: Meaning + Context → Word
      front = note.meaning;
      if (hasMaskedContext) {
        front += `\n\n"${masked}"`;
      }

      back = note.targetWord;
      back += `\n\n"${note.targetSentence}"`;
      if (note.alternativePhrasing) {
        back += `\n\nAlt: ${note.alternativePhrasing}`;
      }
    }

    if (note.notes) {
      back += `\n\n${note.notes}`;
    }

    return {
      cardType: CardType.PRODUCTION,
      front,
      back,
    };
  }

  /**
   * RECOGNITION CARD (Secondary)
   *
   * Tests passive recognition: See word in context → understand meaning
   * Use sparingly - this is easier and less effective than production.
   */
  private generateRecognitionCard(note: NoteData, sourceType: CardSourceType): GeneratedCard {
    let front: string;
    let back: string;

    if (sourceType === CardSourceType.DICTIONARY) {
      // Dictionary: Word → Definition
      front = note.targetWord;
      back = note.meaning;
      if (note.targetSentence) {
        back += `\n\n"${note.targetSentence}"`;
      }
    } else {
      // Sentence: Highlighted sentence → Meaning
      front = this.highlightWord(note.targetSentence, note.targetWord);
      back = `${note.targetWord} = ${note.meaning}`;
      if (note.alternativePhrasing) {
        back += `\n\nAlt: ${note.alternativePhrasing}`;
      }
    }

    if (note.notes) {
      back += `\n\n${note.notes}`;
    }

    return {
      cardType: CardType.RECOGNITION,
      front,
      back,
    };
  }

  // ===== Helpers =====

  private maskWord(sentence: string, word: string): string {
    // Try exact match
    const exactRegex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi');
    if (exactRegex.test(sentence)) {
      return sentence.replace(exactRegex, '____');
    }

    // Try word forms
    for (const form of this.getWordForms(word.toLowerCase())) {
      const formRegex = new RegExp(`\\b${this.escapeRegex(form)}\\b`, 'gi');
      if (formRegex.test(sentence)) {
        return sentence.replace(formRegex, '____');
      }
    }

    // Try stem
    const stem = this.getStem(word.toLowerCase());
    if (stem.length >= 3) {
      const stemRegex = new RegExp(`\\b${this.escapeRegex(stem)}\\w*\\b`, 'gi');
      if (stemRegex.test(sentence)) {
        return sentence.replace(stemRegex, '____');
      }
    }

    return sentence;
  }

  private highlightWord(sentence: string, word: string): string {
    const exactRegex = new RegExp(`\\b(${this.escapeRegex(word)})\\b`, 'gi');
    if (exactRegex.test(sentence)) {
      return sentence.replace(exactRegex, '**$1**');
    }

    for (const form of this.getWordForms(word.toLowerCase())) {
      const formRegex = new RegExp(`\\b(${this.escapeRegex(form)})\\b`, 'gi');
      if (formRegex.test(sentence)) {
        return sentence.replace(formRegex, '**$1**');
      }
    }

    const stem = this.getStem(word.toLowerCase());
    if (stem.length >= 3) {
      const stemRegex = new RegExp(`\\b(${this.escapeRegex(stem)}\\w*)\\b`, 'gi');
      if (stemRegex.test(sentence)) {
        return sentence.replace(stemRegex, '**$1**');
      }
    }

    return sentence;
  }

  private getWordForms(word: string): string[] {
    const forms: string[] = [];
    forms.push(word + 's', word + 'es', word + 'ed', word + 'ing');
    forms.push(word + 'er', word + 'est', word + 'ly');

    if (word.endsWith('e')) {
      forms.push(word.slice(0, -1) + 'ing', word.slice(0, -1) + 'ed');
    }
    if (word.endsWith('y')) {
      forms.push(word.slice(0, -1) + 'ies', word.slice(0, -1) + 'ied');
    }
    if (/[aeiou][bcdfghjklmnpqrstvwxyz]$/.test(word)) {
      const d = word + word[word.length - 1];
      forms.push(d + 'ing', d + 'ed');
    }

    return forms;
  }

  private getStem(word: string): string {
    const suffixes = ['ingly', 'edly', 'ing', 'ed', 'ly', 'es', 's', 'er', 'est'];
    for (const s of suffixes) {
      if (word.endsWith(s) && word.length > s.length + 2) {
        return word.slice(0, -s.length);
      }
    }
    return word;
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
