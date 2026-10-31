import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { LocatorDto } from './locator.models';
import type { JsonValue } from '@prisma/client/runtime/library';

export class CreateHighlightDto {
  @ApiProperty({ description: 'Highlighted text content' })
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiProperty({ type: LocatorDto, description: 'Where in the book (Locator v2)' })
  @ValidateNested()
  @Type(() => LocatorDto)
  anchor!: LocatorDto;

  @ApiPropertyOptional({ description: 'Highlight color (hex)', example: '#ffe066' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Optional linked note ID' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
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
