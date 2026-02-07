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
  clozeIndex?: number;
}

export interface GenerationSettings {
  generateRecognition: boolean;
  generateProduction: boolean;
  generateCloze: boolean;
  generateGrammar: boolean;
  sourceType?: CardSourceType;
}

@Injectable()
export class CardGeneratorService {
  /**
   * Generate all card types from a learning note based on settings
   * One note can produce multiple cards for varied training
   */
  generateCards(note: NoteData, settings: GenerationSettings): GeneratedCard[] {
    const sourceType = settings.sourceType ?? CardSourceType.SENTENCE;

    if (sourceType === CardSourceType.DICTIONARY) {
      return this.generateDictionaryCards(note, settings);
    }

    return this.generateSentenceCards(note, settings);
  }

  /**
   * Generate cards for sentence-based learning (highlights, manual notes)
   */
  private generateSentenceCards(
    note: NoteData,
    settings: GenerationSettings,
  ): GeneratedCard[] {
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
   * Generate cards for dictionary-based vocabulary learning
   * Uses word-focused templates instead of sentence-focused
   */
  private generateDictionaryCards(
    note: NoteData,
    settings: GenerationSettings,
  ): GeneratedCard[] {
    const cards: GeneratedCard[] = [];

    if (settings.generateRecognition) {
      cards.push(this.generateDictionaryRecognitionCard(note));
    }

    if (settings.generateProduction) {
      cards.push(this.generateDictionaryProductionCard(note));
    }

    if (settings.generateCloze) {
      const clozeCards = this.generateDictionaryClozeCards(note);
      cards.push(...clozeCards);
    }

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

    front += `\n\nFocus: ${note.targetWord}`;

    let back = note.meaning;
    if (note.notes) {
      back += `\n\nNote: ${note.notes}`;
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
    const front = `Translate to target language:\n\n"${note.meaning}"\n\nUse: ${note.targetWord}`;

    let back = note.targetSentence;
    if (note.alternativePhrasing) {
      back += `\n\nAlternative: ${note.alternativePhrasing}`;
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

      const front = `${clozeSentence}\n\nMeaning: ${note.meaning}_`;

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
      const front = `Complete the sentence:\n\n${sentence}\n\nHint: Use a form of "${targetWord}"\nMeaning: ${note.meaning}`;

      cards.push({
        cardType: CardType.CLOZE,
        front,
        back: targetWord,
        clozeIndex: 0,
      });
    }

    return cards;
  }

  // ===== Dictionary-specific card generators =====

  /**
   * Dictionary Recognition: See word with example → recall definition
   * Tests vocabulary comprehension
   */
  private generateDictionaryRecognitionCard(note: NoteData): GeneratedCard {
    let front = `**${note.targetWord}**`;

    // Add example sentence for context
    if (note.targetSentence) {
      const highlighted = this.highlightWordFlexible(
        note.targetSentence,
        note.targetWord,
      );
      front += `\n\n_"${highlighted}"_`;
    }

    let back = note.meaning;
    if (note.notes) {
      back += `\n\n${note.notes}`;
    }

    return {
      cardType: CardType.RECOGNITION,
      front,
      back,
    };
  }

  /**
   * Dictionary Production: See definition → produce the word
   * Tests active vocabulary recall
   */
  private generateDictionaryProductionCard(note: NoteData): GeneratedCard {
    let front = `What word means:\n\n"${note.meaning}"`;

    // Add first letter hint for harder words
    if (note.targetWord.length > 6) {
      front += `\n\nFirst letter: ${note.targetWord[0].toUpperCase()}`;
    }

    let back = `**${note.targetWord}**`;

    // Show example sentence on the back
    if (note.targetSentence) {
      const highlighted = this.highlightWordFlexible(
        note.targetSentence,
        note.targetWord,
      );
      back += `\n\n_"${highlighted}"_`;
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
   * Dictionary Cloze: Example sentence with blank → fill in the word
   * Tests word usage in context with flexible matching
   */
  private generateDictionaryClozeCards(note: NoteData): GeneratedCard[] {
    const cards: GeneratedCard[] = [];
    const sentence = note.targetSentence;
    const targetWord = note.targetWord;

    if (!sentence) {
      // No example sentence, skip cloze for dictionary entries
      return cards;
    }

    // Try to find the word or its forms in the sentence
    const wordMatch = this.findWordInSentence(sentence, targetWord);

    if (wordMatch) {
      const clozeSentence =
        sentence.substring(0, wordMatch.index) +
        '_____' +
        sentence.substring(wordMatch.index + wordMatch.text.length);

      const front = clozeSentence;

      let back = `**${wordMatch.text}**`;
      back += `\n\nDefinition: ${note.meaning}`;

      cards.push({
        cardType: CardType.CLOZE,
        front,
        back,
        clozeIndex: 0,
      });
    } else {
      // Word form not found - create a contextual fill-in card
      const front = `Fill in the blank with the correct form of **${targetWord}**:\n\n${this.createBlankInSentence(sentence, targetWord)}`;

      let back = `**${targetWord}**`;
      back += `\n\nFull sentence: _"${sentence}"_`;
      back += `\n\nDefinition: ${note.meaning}`;

      cards.push({
        cardType: CardType.CLOZE,
        front,
        back,
        clozeIndex: 0,
      });
    }

    return cards;
  }

  /**
   * Find a word or its forms in a sentence
   * Handles common word form variations (plurals, verb forms, etc.)
   */
  private findWordInSentence(
    sentence: string,
    word: string,
  ): { index: number; text: string } | null {
    const lowerWord = word.toLowerCase();

    // Try exact match first
    const exactRegex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'gi');
    const exactMatch = exactRegex.exec(sentence);
    if (exactMatch) {
      return { index: exactMatch.index, text: exactMatch[0] };
    }

    // Generate common word forms to try
    const wordForms = this.generateWordForms(lowerWord);

    for (const form of wordForms) {
      const formRegex = new RegExp(`\\b${this.escapeRegex(form)}\\b`, 'gi');
      const match = formRegex.exec(sentence);
      if (match) {
        return { index: match.index, text: match[0] };
      }
    }

    // Try stem-based matching (find words starting with the stem)
    const stem = this.getWordStem(lowerWord);
    if (stem.length >= 3) {
      const stemRegex = new RegExp(`\\b${this.escapeRegex(stem)}\\w*\\b`, 'gi');
      const match = stemRegex.exec(sentence);
      if (match) {
        return { index: match.index, text: match[0] };
      }
    }

    return null;
  }

  /**
   * Generate common word forms for matching
   */
  private generateWordForms(word: string): string[] {
    const forms: string[] = [];

    // Common English suffixes
    forms.push(word + 's'); // plural
    forms.push(word + 'es'); // plural
    forms.push(word + 'ed'); // past tense
    forms.push(word + 'ing'); // gerund
    forms.push(word + 'ly'); // adverb
    forms.push(word + 'er'); // comparative
    forms.push(word + 'est'); // superlative

    // Handle words ending in 'e'
    if (word.endsWith('e')) {
      forms.push(word.slice(0, -1) + 'ing'); // make -> making
      forms.push(word.slice(0, -1) + 'ed'); // make -> maked (irregular handled by stem)
    }

    // Handle words ending in 'y'
    if (word.endsWith('y')) {
      forms.push(word.slice(0, -1) + 'ies'); // carry -> carries
      forms.push(word.slice(0, -1) + 'ied'); // carry -> carried
    }

    // Double consonant forms
    if (/[aeiou][bcdfghjklmnpqrstvwxyz]$/.test(word)) {
      const doubled = word + word[word.length - 1];
      forms.push(doubled + 'ing'); // run -> running
      forms.push(doubled + 'ed'); // stop -> stopped
    }

    return forms;
  }

  /**
   * Get a simple stem of a word (removes common suffixes)
   */
  private getWordStem(word: string): string {
    const suffixes = [
      'ingly',
      'edly',
      'ing',
      'ed',
      'ly',
      'es',
      's',
      'er',
      'est',
      'tion',
      'ness',
      'ment',
      'able',
      'ible',
    ];

    for (const suffix of suffixes) {
      if (word.endsWith(suffix) && word.length > suffix.length + 2) {
        return word.slice(0, -suffix.length);
      }
    }

    return word;
  }

  /**
   * Create a blank in the sentence, attempting to identify where the target word should go
   */
  private createBlankInSentence(sentence: string, targetWord: string): string {
    // Try to find any related word and replace it
    const wordMatch = this.findWordInSentence(sentence, targetWord);
    if (wordMatch) {
      return (
        sentence.substring(0, wordMatch.index) +
        '_____' +
        sentence.substring(wordMatch.index + wordMatch.text.length)
      );
    }

    // If no match found, add blank at a natural position (after first phrase)
    const firstPhraseEnd = sentence.search(/[,;:]|\s-\s/);
    if (firstPhraseEnd > 10) {
      return sentence.substring(0, firstPhraseEnd) + ' _____' + sentence.substring(firstPhraseEnd);
    }

    // Last resort: append blank
    return sentence + ' _____';
  }

  /**
   * Highlight a word in a sentence, with flexible matching for word forms
   */
  private highlightWordFlexible(sentence: string, word: string): string {
    const match = this.findWordInSentence(sentence, word);
    if (match) {
      return (
        sentence.substring(0, match.index) +
        `**${match.text}**` +
        sentence.substring(match.index + match.text.length)
      );
    }
    return sentence;
  }

  /**
   * Grammar card: Produce correct form/conjugation
   * Tests grammatical knowledge
   */
  private generateGrammarCard(note: NoteData): GeneratedCard {
    // Extract base form hint from notes if available
    const baseFormHint = this.extractBaseForm(note.notes || '');

    const front = `Conjugate/decline correctly:\n\nBase: ${baseFormHint || note.targetWord}\nContext: "${note.meaning}"\n\nProduce the correct form`;

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
