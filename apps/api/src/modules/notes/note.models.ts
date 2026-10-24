import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { JsonValue } from '@prisma/client/runtime/library';

// Anchor represents the position of a note in the document
export class NoteAnchorDto {
  @ApiProperty({ enum: ['pdf', 'epub'], description: 'Type of book format' })
  @IsString()
  @IsNotEmpty()
  type!: 'pdf' | 'epub';

  @ApiPropertyOptional({ description: 'Page number (for PDF)' })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'CFI location (for EPUB)' })
  @IsOptional()
  @IsString()
  cfi?: string;
}

export class CreateNoteDto {
  @ApiProperty({ description: 'Note body content (markdown supported)' })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiPropertyOptional({ type: NoteAnchorDto, description: 'Position anchor in document' })
  @IsOptional()
  anchor?: NoteAnchorDto;

  @ApiPropertyOptional({ description: 'Whether the note is pinned', default: false })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class UpdateNoteDto {
  @ApiPropertyOptional({ description: 'Note body content (markdown supported)' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ description: 'Whether the note is pinned' })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ description: 'Whether the note is archived' })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class NoteResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  bookId!: string;

  @ApiProperty()
  body!: string;

  @ApiPropertyOptional({ nullable: true })
  anchor?: JsonValue;

  @ApiProperty()
  isPinned!: boolean;

  @ApiProperty()
  isArchived!: boolean;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;

  @ApiPropertyOptional({ type: 'string', format: 'date-time', nullable: true })
  deletedAt?: Date | null;
}
