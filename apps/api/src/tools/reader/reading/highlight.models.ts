import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import type { JsonValue } from '@prisma/client/runtime/library';

// Anchor represents the position of a highlight in the document
export class HighlightAnchorDto {
  @ApiProperty({ enum: ['pdf', 'epub'], description: 'Type of book format' })
  @IsString()
  @IsNotEmpty()
  type!: 'pdf' | 'epub';

  @ApiPropertyOptional({ description: 'Page number (for PDF)' })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'CFI range (for EPUB)' })
  @IsOptional()
  @IsString()
  cfi?: string;

  @ApiPropertyOptional({ description: 'Text rectangles for PDF highlight rendering' })
  @IsOptional()
  rects?: Array<{ x: number; y: number; width: number; height: number }>;
}

export class CreateHighlightDto {
  @ApiProperty({ description: 'Highlighted text content' })
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiProperty({ type: HighlightAnchorDto, description: 'Position anchor in document' })
  @IsNotEmpty()
  anchor!: HighlightAnchorDto;

  @ApiPropertyOptional({ description: 'Highlight color (hex)', example: '#ffe066' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Optional linked note ID' })
  @IsOptional()
  @IsString()
  @IsUUID()
  noteId?: string;
}

export class UpdateHighlightDto {
  @ApiPropertyOptional({ description: 'Highlight color (hex)', example: '#ffe066' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Optional linked note ID' })
  @IsOptional()
  @IsString()
  noteId?: string | null;
}

export class HighlightResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  bookId!: string;

  @ApiPropertyOptional({ nullable: true })
  color?: string | null;

  @ApiProperty()
  text!: string;

  @ApiProperty()
  anchor!: JsonValue;

  @ApiPropertyOptional({ nullable: true })
  noteId?: string | null;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
}
