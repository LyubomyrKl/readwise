import { LocatorDto } from '../reading/locator.models';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';
import { IsNumber, IsOptional, IsUUID, Length, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BOOK_CONSTRAINTS } from './document.constants';

/** A reading position as stored: Locator v2, or the v1 shape (type, page, cfi, percentage) the readers upgrade. */
export type StoredReadingPosition = Record<string, unknown>;

/**
 * A document in the library. Notes and highlights are fetched through the
 * reading endpoints and editions through /reader/documents/:id/editions;
 * only the note and highlight counts travel with the book.
 */
export class BookResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description?: string | null;

  @ApiProperty()
  author!: string;

  @ApiProperty()
  coverUrl?: string;

  @ApiProperty()
  fileUrl!: string;

  @ApiProperty()
  spentTime!: number;

  @ApiProperty()
  pageCount: number;

  @ApiProperty()
  pagePassCount!: number;

  @ApiProperty()
  isFinished!: boolean;

  @ApiProperty()
  isFavorite!: boolean;

  @ApiProperty()
  lastAccessed: Date | null;

  @ApiProperty()
  mime!: string;

  @ApiProperty()
  sizeBytes!: string;

  @ApiProperty({ description: 'State of the file itself: ready | error. Edition state lives on the editions and their jobs.' })
  status!: string;

  @ApiPropertyOptional({ nullable: true, description: 'File-level error, present when status is "error"' })
  errorMessage?: string | null;

  @ApiProperty({ description: 'true once reader.ingest has read the structure (GET /reader/documents/:id/structure)' })
  hasStructure!: boolean;

  @ApiPropertyOptional({ nullable: true, description: '"en", "ru", "uk" or "other", detected on upload' })
  language?: string | null;

  @ApiProperty({ description: 'Number of notes (not deleted)' })
  noteCount!: number;

  @ApiProperty({ description: 'Number of highlights (not deleted)' })
  highlightCount!: number;

  @ApiPropertyOptional({ type: LocatorDto, nullable: true, description: 'Locator v2; positions saved before it keep their v1 shape (type, page, cfi, percentage)' })
  readingPosition?: StoredReadingPosition | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class UpdateLastAccessedDto {
  @ApiProperty({ description: 'Book ID to update last accessed' })
  @IsString()
  @IsNotEmpty()
  bookId!: string;
}

export class UpdateLastAccessedResponse {
  @ApiProperty({ description: 'Book ID' })
  @IsString()
  @IsNotEmpty()
  bookId!: string;
}

export class UpdateSpentTimeDto {
  @ApiProperty({ description: 'Book ID' })
  @IsString()
  @IsNotEmpty()
  bookId!: string;

  @ApiProperty({ description: 'Amount of time in seconds' })
  @IsNumber()
  @IsNotEmpty()
  amount!: number;
}

export class SetBookToFavoriteDto {
  @ApiProperty({ description: 'Book ID', example: 'uuid-here' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  bookId!: string;

  @ApiProperty({ description: 'Whether book is favorite', example: true })
  @IsBoolean()
  isFavorite!: boolean;
}

export class UploadBookDto {
  @ApiProperty({ description: 'Book title', example: 'The Great Gatsby' })
  @IsString()
  @IsNotEmpty()
  @Length(1, BOOK_CONSTRAINTS.MAX_TITLE_LENGTH)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  title!: string;

  @ApiProperty({ description: 'Book author', example: 'F. Scott Fitzgerald' })
  @IsString()
  @IsNotEmpty()
  @Length(1, BOOK_CONSTRAINTS.MAX_AUTHOR_LENGTH)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  author!: string;

  @ApiProperty({ description: 'Book description', example: 'A classic American novel' })
  @IsString()
  @IsNotEmpty()
  @Length(1, BOOK_CONSTRAINTS.MAX_DESCRIPTION_LENGTH)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  description!: string;

  @ApiPropertyOptional({ description: 'Page count', example: 100 })
  @IsOptional()
  @IsNumber()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? parseInt(value, 10) : value,
  )
  pageCount?: number;
}

export class UploadResponse {
  @ApiProperty({ description: 'Created book ID' })
  bookId!: string;

  @ApiProperty({ description: 'Book status' })
  status!: string;
}

export class UpdateReadingPositionDto {
  @ApiProperty({ description: 'Book ID' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  bookId!: string;

  @ApiProperty({ type: LocatorDto, description: 'Reading position (Locator v2)' })
  @ValidateNested()
  @Type(() => LocatorDto)
  position!: LocatorDto;
}
