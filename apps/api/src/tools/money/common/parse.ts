import { BadRequestException } from '@nestjs/common';
import { parseDate } from '../core/dates';
import { parseMinor } from '../core/money';
import { parseQuantity } from '../core/quantity';

/** The core parsers, with their errors turned into 400s naming the field. */

export function toDate(input: string, field = 'date'): Date {
  try {
    return parseDate(input);
  } catch (error) {
    throw new BadRequestException(`${field}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function toMinor(input: string, decimals: number, field = 'amount'): bigint {
  try {
    return parseMinor(input, decimals);
  } catch (error) {
    throw new BadRequestException(`${field}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function toUnits(input: string, field = 'units'): bigint {
  try {
    return parseQuantity(input);
  } catch (error) {
    throw new BadRequestException(`${field}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
