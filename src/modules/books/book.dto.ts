import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
  Max,
  IsUUID,
  IsMimeType,
  Length,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { BOOK_CONSTRAINTS, BOOK_ERROR_MESSAGES } from './book.constants';

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
    description: 'Custom cover file size in bytes',
    example: 102400,
    minimum: 1,
    maximum: BOOK_CONSTRAINTS.MAX_COVER_SIZE,
  })
  @IsOptional()
  @IsNumber()
  @Min(BOOK_CONSTRAINTS.MIN_FILE_SIZE)
  @Max(BOOK_CONSTRAINTS.MAX_COVER_SIZE)
  customCoverSizeBytes?: number;
}

export class FinalizeBookDto {
  @ApiProperty({ description: 'Book ID to finalize', example: 'uuid-here' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  bookId!: string;
}

export class CoverUploadDto {
  @ApiProperty({ description: 'Book ID to add cover to', example: 'uuid-here' })
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  bookId!: string;

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

  @ApiProperty({
    description: 'Cover file size in bytes',
    example: 102400,
    minimum: 1,
    maximum: BOOK_CONSTRAINTS.MAX_COVER_SIZE,
  })
  @IsNumber()
  @Min(BOOK_CONSTRAINTS.MIN_FILE_SIZE)
  @Max(BOOK_CONSTRAINTS.MAX_COVER_SIZE)
  sizeBytes!: number;
}

export class FinalizeCoverDto {
  @ApiProperty({
    description: 'Book ID to finalize cover for',
    example: 'uuid-here',
  })
  @IsString()
  @IsNotEmpty()
  bookId!: string;

  @ApiProperty({ description: 'Storage key of uploaded cover file' })
  @IsString()
  @IsNotEmpty()
  @Length(1, BOOK_CONSTRAINTS.MAX_STORAGE_KEY_LENGTH)
  storageKey!: string;
}
