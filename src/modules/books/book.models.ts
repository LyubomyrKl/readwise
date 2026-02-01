import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { BookStatus } from '@prisma/client';
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

import {
  IsNumber,
  IsOptional,
  Min,
  Max,
  IsUUID,
  IsMimeType,
  Length,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BOOK_CONSTRAINTS, BOOK_ERROR_MESSAGES } from './book.constants';
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

export class BookTagResponse {
  @ApiProperty()
  bookId!: string;

  @ApiProperty()
  tagId!: string;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
}

export class PresignInfo {
  @ApiProperty({ description: 'Presigned upload URL' })
  url!: string;

  @ApiProperty({ description: 'Required headers for upload' })
  headers!: Record<string, string>;
}

export class PresignResponse {
  @ApiProperty({ description: 'Created book ID' })
  bookId!: string;

  @ApiProperty({ description: 'Storage key for book file' })
  storageKey!: string;

  @ApiProperty({
    description: 'Presigned upload info for book file',
    type: PresignInfo,
  })
  presignUploadInfo!: PresignInfo;

  @ApiProperty({
    description: 'Storage key for custom cover file',
    required: false,
  })
  customCoverStorageKey?: string;

  @ApiProperty({
    description: 'Presigned upload info for custom cover',
    type: PresignInfo,
    required: false,
  })
  customCoverPresignInfo?: PresignInfo;
}

export class FinalizeResponse {
  @ApiProperty({ description: 'Book ID' })
  bookId!: string;

  @ApiProperty({
    description: 'Book status after finalization',
    enum: ['ready'],
  })
  status!: BookStatus;
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
  sizeBytes!: string; // BigInt converted to string

  @ApiProperty()
  status!: string;

  @ApiProperty({ type: [NoteResponse] })
  notes!: NoteResponse[];

  @ApiProperty({ type: [HighlightResponse] })
  highlights!: HighlightResponse[];

  @ApiProperty({ type: [BookTagResponse] })
  tags!: BookTagResponse[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class CoverPresignResponse {
  @ApiProperty({
    description: 'Presigned upload info for cover',
    type: PresignInfo,
  })
  presignUploadInfo!: PresignInfo;

  @ApiProperty({ description: 'Storage key for cover file' })
  storageKey!: string;
}

export class CoverUpdateDto {
  @ApiProperty({
    description: 'Book ID to update cover for',
    example: 'uuid-here',
  })
  @IsString()
  @IsNotEmpty()
  bookId!: string;

  @ApiProperty({ description: 'Cover filename', example: 'cover.jpg' })
  @IsString()
  @IsNotEmpty()
  storageKey!: string;
}

export class UpdateLastAccessedDto {
  @ApiProperty({
    description: 'Book ID to update last accessed',
  })
  @IsString()
  @IsNotEmpty()
  bookId!: string;
}

export class UpdateLastAccessedResponse {
  @ApiProperty({
    description: 'Book ID to update last accessed',
  })
  @IsString()
  @IsNotEmpty()
  bookId!: string;
}

export class UpdateSpentTimeDto {
  @ApiProperty({
    description: 'Book ID to update last accessed',
  })
  @IsString()
  @IsNotEmpty()
  bookId!: string;

  @ApiProperty({
    description: 'Amount of time',
  })
  @IsString()
  @IsNotEmpty()
  amount!: number;
}

export class CreateBookDto {
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

  @ApiProperty({
    description: 'Book description',
    example: 'A classic American novel',
  })
  @IsString()
  @IsNotEmpty()
  @Length(1, BOOK_CONSTRAINTS.MAX_DESCRIPTION_LENGTH)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  description!: string;

  @ApiProperty({ description: 'Original filename', example: 'book.epub' })
  @IsString()
  @IsNotEmpty()
  @Length(1, BOOK_CONSTRAINTS.MAX_FILENAME_LENGTH)
  @Matches(BOOK_CONSTRAINTS.FILENAME_PATTERN, {
    message: BOOK_ERROR_MESSAGES.INVALID_FILENAME,
  })
  filename!: string;

  @ApiProperty({
    description: 'MIME type of the book file',
    example: 'application/epub+zip',
  })
  @IsString()
  @IsNotEmpty()
  @IsMimeType()
  mime!: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 2048576,
    minimum: 1,
    maximum: BOOK_CONSTRAINTS.MAX_BOOK_SIZE,
  })
  @IsNumber()
  @Min(BOOK_CONSTRAINTS.MIN_FILE_SIZE)
  @Max(BOOK_CONSTRAINTS.MAX_BOOK_SIZE)
  sizeBytes!: number;

  @ApiPropertyOptional({
    description: 'Custom cover filename',
    example: 'cover.jpg',
  })
  @IsOptional()
  @IsString()
  @Length(1, BOOK_CONSTRAINTS.MAX_FILENAME_LENGTH)
  @Matches(BOOK_CONSTRAINTS.FILENAME_PATTERN, {
    message: BOOK_ERROR_MESSAGES.INVALID_FILENAME,
  })
  customCoverFilename?: string;

  @ApiPropertyOptional({
    description: 'Custom cover MIME type',
    example: 'image/jpeg',
  })
  @IsOptional()
  @IsString()
  @IsMimeType()
  @Matches(BOOK_CONSTRAINTS.COVER_MIME_PATTERN, {
    message: BOOK_ERROR_MESSAGES.COVER_FORMAT_NOT_SUPPORTED,
  })
  customCoverMime?: string;

  @ApiPropertyOptional({
    description: 'Page Number',
    example: 100,
    maximum: BOOK_CONSTRAINTS.MAX_PAGE_COUNT,
  })
  @IsNumber()
  pageCount?: number;
}

export class FinalizeBookDto {
  @ApiProperty({ description: 'Book ID to finalize', example: 'uuid-here' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  bookId!: string;
}

export class FinalizeCoverDto {
  @ApiProperty({
    description: 'Book ID to finalize cover for',
    example: 'uuid-here',
  })
  @IsString()
  @IsNotEmpty()
  bookId!: string;
}

export class PresignedUploadDto {
  @ApiProperty({ description: 'Cover filename', example: 'cover.jpg' })
  @IsString()
  @IsNotEmpty()
  @Length(1, BOOK_CONSTRAINTS.MAX_FILENAME_LENGTH)
  @Matches(BOOK_CONSTRAINTS.FILENAME_PATTERN, {
    message: BOOK_ERROR_MESSAGES.INVALID_FILENAME,
  })
  filename!: string;

  @ApiProperty({ description: 'Cover MIME type', example: 'image/jpeg' })
  @IsString()
  @IsNotEmpty()
  @IsMimeType()
  @Matches(BOOK_CONSTRAINTS.COVER_MIME_PATTERN, {
    message: BOOK_ERROR_MESSAGES.COVER_FORMAT_NOT_SUPPORTED,
  })
  mime!: string;
}


export class SetBookToFavoriteDto {
  @ApiProperty({ description: 'Book ID to finalize', example: 'uuid-here' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  bookId!: string;

  @ApiPropertyOptional({ description: 'Boolean that shows whether or not book is favorite', example: true })
  @IsBoolean()
  isFavorite!: boolean;
}