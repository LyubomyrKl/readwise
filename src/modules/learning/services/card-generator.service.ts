import { Injectable } from '@nestjs/common';
import { CardType } from '../learning.models';

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
  clozeIndex?: number;
}

export interface GenerationSettings {
  generateRecognition: boolean;
  generateProduction: boolean;
  generateCloze: boolean;
  generateGrammar: boolean;
}

@Injectable()
export class CardGeneratorService {
  /**
   * Generate all card types from a learning note based on settings
   * One note can produce multiple cards for varied training
   */
  generateCards(note: NoteData, settings: GenerationSettings): GeneratedCard[] {
    const cards: GeneratedCard[] = [];

    if (settings.generateRecognition) {
      cards.push(this.generateRecognitionCard(note));
    }

    if (settings.generateProduction) {
      cards.push(this.generateProductionCard(note));
    }

    if (settings.generateCloze) {
      const clozeCards = this.generateClozeCards(note);
      cards.push(...clozeCards);
    }

    // Grammar cards require more structured data
    // For now, only generate if we have specific grammar context
    if (settings.generateGrammar && this.hasGrammarContext(note)) {
      cards.push(this.generateGrammarCard(note));
    }

    return cards;
  }

  /**
   * Recognition card: See L2 sentence, recall meaning
   * Tests comprehension of the target language
   */
  private generateRecognitionCard(note: NoteData): GeneratedCard {
    let front = note.targetSentence;

    // Highlight the target word if present
    const highlightedSentence = this.highlightWord(
      note.targetSentence,
      note.targetWord,
    );
    if (highlightedSentence !== note.targetSentence) {
      front = highlightedSentence;
    }

    front += `\n\n_Focus: ${note.targetWord}_`;

    let back = note.meaning;
    if (note.notes) {
      back += `\n\n_Note: ${note.notes}_`;
    }

    return {
      cardType: CardType.RECOGNITION,
      front,
      back,
    };
  }

  /**
   * Production card: See L1 meaning, produce L2 sentence
   * Tests active language production (most important for fluency)
   */
  private generateProductionCard(note: NoteData): GeneratedCard {
    const front = `Translate to target language:\n\n"${note.meaning}"\n\n_Use: ${note.targetWord}_`;

    let back = note.targetSentence;
    if (note.alternativePhrasing) {
      back += `\n\n_Alternative: ${note.alternativePhrasing}_`;
    }

    return {
      cardType: CardType.PRODUCTION,
      front,
      back,
    };
  }

  /**
   * Cloze cards: Fill in the target word
   * Tests word recall in context
   */
  private generateClozeCards(note: NoteData): GeneratedCard[] {
    const cards: GeneratedCard[] = [];
    const sentence = note.targetSentence;
    const targetWord = note.targetWord;

    // Find all occurrences of target word (case-insensitive)
    const regex = new RegExp(`\\b${this.escapeRegex(targetWord)}\\b`, 'gi');
    let match: RegExpExecArray | null;
    let clozeIndex = 0;
    const matches: { index: number; text: string }[] = [];

    while ((match = regex.exec(sentence)) !== null) {
      matches.push({ index: match.index, text: match[0] });
    }

    // Generate a cloze card for each occurrence
    for (const m of matches) {
      const clozeSentence =
        sentence.substring(0, m.index) +
        '[...]' +
        sentence.substring(m.index + m.text.length);

      const front = `${clozeSentence}\n\n_Meaning: ${note.meaning}_`;

      cards.push({
        cardType: CardType.CLOZE,
        front,
        back: m.text, // Preserve original casing
        clozeIndex,
      });

      clozeIndex++;
    }

    // If no exact match found, create a single cloze with hint
    if (cards.length === 0) {
      const front = `Complete the sentence:\n\n${sentence}\n\n_Hint: Use a form of "${targetWord}"_\n_Meaning: ${note.meaning}_`;

      cards.push({
        cardType: CardType.CLOZE,
        front,
        back: targetWord,
        clozeIndex: 0,
      });
    }

    return cards;
  }

  /**
   * Grammar card: Produce correct form/conjugation
   * Tests grammatical knowledge
   */
  private generateGrammarCard(note: NoteData): GeneratedCard {
    // Extract base form hint from notes if available
    const baseFormHint = this.extractBaseForm(note.notes || '');

    const front = `Conjugate/decline correctly:\n\nBase: ${baseFormHint || note.targetWord}\nContext: "${note.meaning}"\n\n_Produce the correct form_`;

    const back = `${note.targetWord}\n\nFull sentence: ${note.targetSentence}`;

    return {
      cardType: CardType.GRAMMAR,
      front,
      back,
    };
  }

  /**
   * Highlight a word in a sentence using markdown bold
   */
  private highlightWord(sentence: string, word: string): string {
    const regex = new RegExp(`\\b(${this.escapeRegex(word)})\\b`, 'gi');
    return sentence.replace(regex, '**$1**');
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Check if note has grammar-specific context
   */
  private hasGrammarContext(note: NoteData): boolean {
    if (!note.notes) return false;

    const grammarKeywords = [
      'conjugat',
      'declen',
      'tense',
      'case',
      'plural',
      'singular',
      'infinitive',
      'past',
      'present',
      'future',
      'subjunctive',
      'imperative',
      'nominative',
      'accusative',
      'dative',
      'genitive',
    ];

    const notesLower = note.notes.toLowerCase();
    return grammarKeywords.some((kw) => notesLower.includes(kw));
  }

  /**
   * Extract base form from notes
   */
  private extractBaseForm(notes: string): string | null {
    // Look for patterns like "base: word" or "infinitive: word"
    const patterns = [
      /base:\s*(\w+)/i,
      /infinitive:\s*(\w+)/i,
      /root:\s*(\w+)/i,
    ];

    for (const pattern of patterns) {
      const match = notes.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }
}
