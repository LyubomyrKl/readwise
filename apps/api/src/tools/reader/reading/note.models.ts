import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { LocatorDto } from '../reading/locator.models';
import type { JsonValue } from '@prisma/client/runtime/library';

export class CreateNoteDto {
  @ApiProperty({ description: 'Note body content (markdown supported)' })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiPropertyOptional({ type: LocatorDto, description: 'Where in the book (Locator v2)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocatorDto)
  anchor?: LocatorDto;

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
