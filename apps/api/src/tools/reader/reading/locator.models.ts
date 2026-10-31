import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidateNested,
  type ValidationOptions,
} from 'class-validator';

/** A list of up to 500 quads, each 8 finite numbers (x1,y1 x2,y2 x3,y3 x4,y4 in PDF user space). */
export function IsQuads(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isQuads',
      validator: {
        validate: (value: unknown) =>
          Array.isArray(value) &&
          value.length <= 500 &&
          value.every((q) => Array.isArray(q) && q.length === 8 && q.every((n) => typeof n === 'number' && Number.isFinite(n))),
        defaultMessage: () => '$property must be up to 500 quads of 8 finite numbers',
      },
    },
    options,
  );
}

/** The formats the readers render. */
export const LOCATOR_FORMATS = ['pdf', 'epub'] as const;

export class QuoteDto {
  @ApiProperty({ description: 'The selected text, normalized (NFC, whitespace collapsed, soft hyphens dropped)' })
  @IsString()
  @MaxLength(20000)
  exact!: string;

  @ApiPropertyOptional({ description: 'Up to 32 characters before it' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  prefix?: string;

  @ApiPropertyOptional({ description: 'Up to 32 characters after it' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  suffix?: string;
}

export class TextPositionDto {
  @ApiProperty({ description: 'Start, in code points of the normalized chapter or page text' })
  @IsInt()
  @Min(0)
  start!: number;

  @ApiProperty({ description: 'End (exclusive)' })
  @IsInt()
  @Min(0)
  end!: number;
}

export class PageQuadsDto {
  @ApiProperty({ description: '0-based page index' })
  @IsInt()
  @Min(0)
  page!: number;

  @ApiProperty({ description: 'Quads in PDF user space, 8 numbers each', type: 'array', items: { type: 'array', items: { type: 'number' } } })
  @IsQuads()
  quads!: number[][];
}

/**
 * Locator v2: a place in a book (a reading position, the target of a highlight or a note), with
 * redundant parts the reader tries from the most precise to the most robust
 * (docs/document-architecture.md). Every field is checked; anything else is refused.
 */
export class LocatorDto {
  @ApiProperty({ enum: [2] })
  @Equals(2)
  v!: 2;

  @ApiProperty({ enum: LOCATOR_FORMATS })
  @IsIn(LOCATOR_FORMATS)
  format!: (typeof LOCATOR_FORMATS)[number];

  @ApiPropertyOptional({ description: 'Reflowable: the chapter path in the book' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  href?: string;

  @ApiPropertyOptional({ description: 'Reflowable: block ids of the first and last block covered', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  blocks?: string[];

  @ApiPropertyOptional({ description: 'Reflowable: engine cache, an EPUB CFI' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cfi?: string;

  @ApiPropertyOptional({ description: 'Fixed layout: 0-based page index' })
  @IsOptional()
  @IsInt()
  @Min(0)
  page?: number;

  @ApiPropertyOptional({ description: 'Fixed layout: the printed page label' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  pageLabel?: string;

  @ApiPropertyOptional({ description: 'Fixed layout: quads on `page` in PDF user space, 8 numbers each', type: 'array', items: { type: 'array', items: { type: 'number' } } })
  @IsOptional()
  @IsQuads()
  quads?: number[][];

  @ApiPropertyOptional({ description: 'Fixed layout: the same selection on the pages after `page`', type: [PageQuadsDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PageQuadsDto)
  continuation?: PageQuadsDto[];

  @ApiPropertyOptional({ type: QuoteDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuoteDto)
  quote?: QuoteDto;

  @ApiPropertyOptional({ type: TextPositionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TextPositionDto)
  position?: TextPositionDto;

  @ApiPropertyOptional({ description: '0..1 within the chapter or page' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  progression?: number;

  @ApiPropertyOptional({ description: '0..1 in the book' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  totalProgression?: number;

  @ApiPropertyOptional({ description: 'The engine that computed the caches, e.g. pdfjs-6.4.299' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  engine?: string;
}

/** A validated locator as the plain JSON the anchor and readingPosition columns store. */
export function locatorJson(locator: LocatorDto): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(locator)) as Prisma.InputJsonValue;
}
