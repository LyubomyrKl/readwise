import { BadRequestException } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';

/** Wire formats. Amounts and units travel as decimal strings, never as JSON numbers (rule 1). */
export const AMOUNT_PATTERN = /^\s*\d+(?:[.,]\d+)?\s*$/;
export const SIGNED_AMOUNT_PATTERN = /^\s*[+-]?\d+(?:[.,]\d+)?\s*$/;
export const UNITS_PATTERN = /^\s*\d+(?:[.,]\d+)?\s*$/;
export const SIGNED_UNITS_PATTERN = /^\s*[+-]?\d+(?:[.,]\d+)?\s*$/;
export const RATE_PATTERN = /^\s*\d+(?:[.,]\d+)?\s*$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;
export const PERCENT_PATTERN = /^\s*\d{1,3}(?:[.,]\d{1,4})?\s*$/;

export const AMOUNT_MESSAGE = 'an amount like 1234.56 (digits, one "." or ",")';
export const DATE_MESSAGE = 'a date like 2026-10-28';

/**
 * Validates a plain object (a draft, an import row, a recurring template) with
 * the same DTO class the HTTP endpoint uses, so every path into the ledger
 * checks its input the same way.
 */
export async function validateInput<T extends object>(cls: ClassConstructor<T>, plain: unknown): Promise<T> {
  if (!plain || typeof plain !== 'object') throw new BadRequestException('input must be an object');
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length > 0) {
    const messages = errors.flatMap((e) => flatten(e));
    throw new BadRequestException(messages);
  }
  return instance;
}

function flatten(error: import('class-validator').ValidationError, prefix = ''): string[] {
  const path = prefix ? `${prefix}.${error.property}` : error.property;
  const own = Object.values(error.constraints ?? {}).map((m) => (m.startsWith(error.property) ? m.replace(error.property, path) : `${path}: ${m}`));
  return [...own, ...(error.children ?? []).flatMap((c) => flatten(c, path))];
}
