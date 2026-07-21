import { Injectable } from '@nestjs/common';
import { ValidateNoteDto, ValidationResultResponse } from '../learning.models';

@Injectable()
export class ValidatorService {
  private readonly MIN_SENTENCE_WORDS = 3;
  private readonly MAX_SENTENCE_WORDS = 30;
  private readonly PARAGRAPH_THRESHOLD = 50;

  /**
   * Validate note content and return warnings/errors
   * Enforces evidence-based learning principles
   */
  validate(dto: ValidateNoteDto): ValidationResultResponse {
    const warnings: string[] = [];
    const errors: string[] = [];

    const sentenceWords = this.countWords(dto.targetSentence);
    const meaningWords = this.countWords(dto.meaning);

    // Error: Isolated word (no sentence context)
    if (sentenceWords < this.MIN_SENTENCE_WORDS) {
      errors.push(
        'Target sentence is too short. Isolated words without context are ineffective for learning. ' +
          'Please provide a complete sentence.',
      );
    }

    // Error: Paragraph (too long for effective recall)
    if (sentenceWords > this.PARAGRAPH_THRESHOLD) {
      errors.push(
        'Target sentence is too long (appears to be a paragraph). ' +
          'Break it into smaller, focused sentences for better retention.',
      );
    }

    // Warning: Long sentence
    if (
      sentenceWords > this.MAX_SENTENCE_WORDS &&
      sentenceWords <= this.PARAGRAPH_THRESHOLD
    ) {
      warnings.push(
        'Sentence is quite long. Consider using a shorter, more focused example.',
      );
    }

    // Error: Dictionary definition pattern
    if (this.isDictionaryDefinition(dto.meaning)) {
      errors.push(
        'The meaning appears to be a dictionary definition with multiple parts. ' +
          'Use a single, contextual translation that fits this specific sentence.',
      );
    }

    // Error: Synonym list
    if (this.isSynonymList(dto.meaning)) {
      errors.push(
        'The meaning appears to be a list of synonyms. ' +
          'Provide the specific meaning that applies to this sentence context.',
      );
    }

    // Warning: Target word not in sentence
    if (!this.sentenceContainsWord(dto.targetSentence, dto.targetWord)) {
      warnings.push(
        'The target word does not appear in the sentence. ' +
          'Ensure the focus word is present in the example sentence.',
      );
    }

    // Warning: Meaning is same language as sentence (heuristic)
    if (this.appearsSameLanguage(dto.targetSentence, dto.meaning)) {
      warnings.push(
        'The meaning and sentence appear to be in the same language. ' +
          'The meaning should be in your native language (L1) for effective learning.',
      );
    }

    // Warning: Very short meaning
    if (meaningWords < 2 && sentenceWords > 5) {
      warnings.push(
        'The meaning is very short. Consider providing more context for this sentence.',
      );
    }

    return {
      isValid: errors.length === 0,
      warnings,
      errors,
    };
  }

  private countWords(text: string): number {
    return text
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
  }

  private isDictionaryDefinition(text: string): boolean {
    // Patterns: "1. meaning 2. meaning" or "(noun) meaning; (verb) meaning"
    const patterns = [
      /\d+\.\s+\w+/, // Numbered definitions
      /\([a-z]+\)/i, // Part of speech markers like (noun), (verb)
      /;\s*\d+\./, // Semicolon + number pattern
    ];
    return patterns.some((p) => p.test(text));
  }

  private isSynonymList(text: string): boolean {
    // Pattern: "word1, word2, word3" (3+ comma-separated single words)
    const parts = text.split(/,\s*/);
    if (parts.length >= 3) {
      const allSingleWords = parts.every(
        (p) => p.trim().split(/\s+/).length === 1,
      );
      return allSingleWords;
    }
    return false;
  }

  private sentenceContainsWord(sentence: string, word: string): boolean {
    const normalized = sentence.toLowerCase();
    const wordLower = word.toLowerCase();
    // Allow for word boundaries or partial matches (for conjugations/declensions)
    return normalized.includes(wordLower);
  }

  private appearsSameLanguage(text1: string, text2: string): boolean {
    // Heuristic: check for non-Latin scripts
    const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
    const koreanPattern = /[\uAC00-\uD7AF\u1100-\u11FF]/;
    const cyrillicPattern = /[\u0400-\u04FF]/;
    const arabicPattern = /[\u0600-\u06FF]/;
    const hebrewPattern = /[\u0590-\u05FF]/;
    const thaiPattern = /[\u0E00-\u0E7F]/;

    const scripts = [
      japanesePattern,
      koreanPattern,
      cyrillicPattern,
      arabicPattern,
      hebrewPattern,
      thaiPattern,
    ];

    for (const pattern of scripts) {
      const has1 = pattern.test(text1);
      const has2 = pattern.test(text2);
      // If both have same non-Latin script, likely same language
      if (has1 && has2) {
        return true;
      }
    }

    return false;
  }
}
