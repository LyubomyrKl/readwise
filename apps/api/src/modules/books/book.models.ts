import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';
import { IsNumber, IsOptional, IsUUID, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { BOOK_CONSTRAINTS } from './book.constants';
import type { JsonValue } from '@prisma/client/runtime/edge';

export class NoteResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  bookId!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty()
  anchor: JsonValue;

  @ApiProperty()
  isPinned!: boolean;

  @ApiProperty()
  isArchived!: boolean;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  deletedAt?: Date | null;
}

export class HighlightResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  bookId!: string;

  @ApiProperty({ nullable: true })
  color?: string | null;

  @ApiProperty()
  text!: string;

  @ApiProperty()
  anchor!: JsonValue;

  @ApiProperty({ nullable: true })
  noteId?: string | null;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  deletedAt?: Date | null;
}

export class ReadingPositionResponse {
  @ApiProperty({ enum: ['pdf', 'epub'] })
  type!: 'pdf' | 'epub';

  @ApiPropertyOptional()
  page?: number;

  @ApiPropertyOptional()
  cfi?: string;

  @ApiPropertyOptional()
  percentage?: number;
}

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
  summaryKey?: string | null;

  @ApiProperty()
  lastAccessed: Date | null;

  @ApiProperty()
  mime!: string;

  @ApiProperty()
  sizeBytes!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Last processing error, present when status is "error"',
  })
  errorMessage?: string | null;

  @ApiProperty({ type: [NoteResponse] })
  notes!: NoteResponse[];

  @ApiProperty({ type: [HighlightResponse] })
  highlights!: HighlightResponse[];

  @ApiPropertyOptional({ type: ReadingPositionResponse, nullable: true })
  readingPosition?: ReadingPositionResponse | null;

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

// Reading Position types
export class ReadingPositionDto {
  @ApiProperty({ enum: ['pdf', 'epub'], description: 'Type of book format' })
  @IsString()
  @IsNotEmpty()
  type!: 'pdf' | 'epub';

  @ApiPropertyOptional({ description: 'Current page number (for PDF)' })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ description: 'CFI location string (for EPUB)' })
  @IsOptional()
  @IsString()
  cfi?: string;

  @ApiPropertyOptional({ description: 'Reading progress percentage (0-100)' })
  @IsOptional()
  @IsNumber()
  percentage?: number;
}

export class UpdateReadingPositionDto {
  @ApiProperty({ description: 'Book ID' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  bookId!: string;

  @ApiProperty({ type: ReadingPositionDto, description: 'Reading position data' })
  @IsNotEmpty()
  position!: ReadingPositionDto;
}

