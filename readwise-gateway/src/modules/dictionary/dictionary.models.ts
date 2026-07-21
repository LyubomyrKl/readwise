import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsInt,
  Min,
  Max,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ===== DTOs =====

export class CreateCollocationDto {
  @ApiProperty({ description: 'The collocation phrase' })
  @IsString()
  @IsNotEmpty()
  phrase!: string;

  @ApiPropertyOptional({ description: 'L1 translation of the collocation' })
  @IsOptional()
  @IsString()
  translation?: string;

  @ApiPropertyOptional({ description: 'Example sentence using collocation' })
  @IsOptional()
  @IsString()
  example?: string;
}

export class CreateDictionaryEntryDto {
  @ApiProperty({ description: 'The headword' })
  @IsString()
  @IsNotEmpty()
  word!: string;

  @ApiPropertyOptional({ description: 'Part of speech (noun, verb, adj, etc.)' })
  @IsOptional()
  @IsString()
  partOfSpeech?: string;

  @ApiPropertyOptional({ description: 'IPA pronunciation' })
  @IsOptional()
  @IsString()
  pronunciation?: string;

  @ApiProperty({ description: 'Primary definition in L1' })
  @IsString()
  @IsNotEmpty()
  definition!: string;

  @ApiPropertyOptional({ description: 'Subtle usage notes, register, connotation' })
  @IsOptional()
  @IsString()
  nuance?: string;

  @ApiProperty({ description: 'Your own example sentence (required for Generation Effect)' })
  @IsString()
  @IsNotEmpty()
  personalExample!: string;

  @ApiPropertyOptional({ description: 'Where did you encounter this word?' })
  @IsOptional()
  @IsString()
  sourceContext?: string;

  @ApiPropertyOptional({ description: 'User-defined tags', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];

  @ApiPropertyOptional({ description: 'Collocations to add with the entry', type: [CreateCollocationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCollocationDto)
  @ArrayMaxSize(50)
  collocations?: CreateCollocationDto[];
}

export class UpdateDictionaryEntryDto {
  @ApiPropertyOptional({ description: 'The headword' })
  @IsOptional()
  @IsString()
  word?: string;

  @ApiPropertyOptional({ description: 'Part of speech (noun, verb, adj, etc.)' })
  @IsOptional()
  @IsString()
  partOfSpeech?: string;

  @ApiPropertyOptional({ description: 'IPA pronunciation' })
  @IsOptional()
  @IsString()
  pronunciation?: string;

  @ApiPropertyOptional({ description: 'Primary definition in L1' })
  @IsOptional()
  @IsString()
  definition?: string;

  @ApiPropertyOptional({ description: 'Subtle usage notes, register, connotation' })
  @IsOptional()
  @IsString()
  nuance?: string;

  @ApiPropertyOptional({ description: 'Your own example sentence' })
  @IsOptional()
  @IsString()
  personalExample?: string;

  @ApiPropertyOptional({ description: 'Where did you encounter this word?' })
  @IsOptional()
  @IsString()
  sourceContext?: string;

  @ApiPropertyOptional({ description: 'User-defined tags', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];
}

export class DictionarySearchQueryDto {
  @ApiPropertyOptional({ description: 'Search query for word prefix' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by mastery level (0=new, 1=has cards, 2=mature)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2)
  masteryLevel?: number;

  @ApiPropertyOptional({ description: 'Filter by tag' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ description: 'Sort by: createdAt, word, masteryLevel', default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: 'createdAt' | 'word' | 'masteryLevel';

  @ApiPropertyOptional({ description: 'Sort direction', default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ description: 'Number of entries to skip' })
  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ description: 'Number of entries to take', default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

// ===== Response Types =====

export class CollocationResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  phrase!: string;

  @ApiPropertyOptional()
  translation?: string | null;

  @ApiPropertyOptional()
  example?: string | null;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;
}

export class DictionaryEntryResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  word!: string;

  @ApiPropertyOptional()
  partOfSpeech?: string | null;

  @ApiPropertyOptional()
  pronunciation?: string | null;

  @ApiProperty()
  definition!: string;

  @ApiPropertyOptional()
  nuance?: string | null;

  @ApiProperty()
  personalExample!: string;

  @ApiPropertyOptional()
  sourceContext?: string | null;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty({ description: '0=new, 1=has cards, 2=mature cards' })
  masteryLevel!: number;

  @ApiPropertyOptional({ type: 'string', format: 'date-time' })
  lastReviewed?: Date | null;

  @ApiProperty({ type: [CollocationResponse] })
  collocations!: CollocationResponse[];

  @ApiProperty({ description: 'Number of learning notes linked to this entry' })
  cardsCount!: number;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
}

export class DictionaryStatsResponse {
  @ApiProperty({ description: 'Total number of dictionary entries' })
  totalEntries!: number;

  @ApiProperty({ description: 'Entries with cards (mastery >= 1)' })
  entriesWithCards!: number;

  @ApiProperty({ description: 'Entries with mature cards (mastery = 2)' })
  matureEntries!: number;

  @ApiProperty({ description: 'Entries without cards' })
  entriesNeedingCards!: number;

  @ApiProperty({ description: 'Entries older than 3 days without cards (aging)' })
  agingEntries!: number;

  @ApiProperty({ description: 'Total collocations count' })
  totalCollocations!: number;
}

export class DictionarySearchResult {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  word!: string;

  @ApiPropertyOptional()
  partOfSpeech?: string | null;

  @ApiProperty()
  definition!: string;

  @ApiProperty()
  masteryLevel!: number;
}

// ===== Semantic Groups =====

export class CreateSemanticGroupDto {
  @ApiProperty({ description: 'Group name (e.g., "emotions", "cooking verbs")' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Description of the group' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Hex color for UI display (e.g., "#3B82F6")' })
  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateSemanticGroupDto {
  @ApiPropertyOptional({ description: 'Group name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Description of the group' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Hex color for UI display' })
  @IsOptional()
  @IsString()
  color?: string;
}

export class AddEntryToGroupsDto {
  @ApiProperty({ description: 'Group IDs to add the entry to', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  groupIds!: string[];
}

export class SemanticGroupResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description?: string | null;

  @ApiPropertyOptional()
  color?: string | null;

  @ApiProperty({ description: 'Number of entries in this group' })
  entryCount!: number;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
}

export class RelatedWordResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  word!: string;

  @ApiProperty()
  definition!: string;

  @ApiPropertyOptional()
  partOfSpeech?: string | null;

  @ApiProperty({ description: 'Names of groups shared with the queried word', type: [String] })
  sharedGroups!: string[];
}

export class WordWithRelatedResponse {
  @ApiProperty({ type: DictionaryEntryResponse })
  entry!: DictionaryEntryResponse;

  @ApiProperty({ type: [SemanticGroupResponse] })
  groups!: SemanticGroupResponse[];

  @ApiProperty({ description: 'Related words from shared groups, ordered by overlap', type: [RelatedWordResponse] })
  relatedWords!: RelatedWordResponse[];
}

// ===== Synonym Groups =====

export class CreateSynonymGroupDto {
  @ApiPropertyOptional({ description: 'Optional name for the synonym group (e.g., "happy words")' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Entry IDs to include in the synonym group', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @ArrayMaxSize(50)
  entryIds!: string[];
}

export class UpdateSynonymGroupDto {
  @ApiPropertyOptional({ description: 'Name for the synonym group' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class AddEntriesToSynonymGroupDto {
  @ApiProperty({ description: 'Entry IDs to add to the synonym group', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  entryIds!: string[];
}

export class SynonymEntryResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  word!: string;

  @ApiProperty()
  definition!: string;

  @ApiPropertyOptional()
  partOfSpeech?: string | null;

  @ApiProperty()
  masteryLevel!: number;
}

export class SynonymGroupResponse {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  name?: string | null;

  @ApiProperty({ description: 'Number of entries in this synonym group' })
  entryCount!: number;

  @ApiProperty({ type: [SynonymEntryResponse] })
  entries!: SynonymEntryResponse[];

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
}

export class SynonymGroupSummaryResponse {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional()
  name?: string | null;

  @ApiProperty({ description: 'Number of entries in this synonym group' })
  entryCount!: number;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: Date;
}
