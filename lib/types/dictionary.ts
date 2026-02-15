// ===== DTOs =====

export interface CreateCollocationDto {
  phrase: string;
  translation?: string;
  example?: string;
}

export interface CreateDictionaryEntryDto {
  word: string;
  partOfSpeech?: string;
  pronunciation?: string;
  definition: string;
  nuance?: string;
  personalExample: string;
  sourceContext?: string;
  tags?: string[];
  collocations?: CreateCollocationDto[];
}

export interface UpdateDictionaryEntryDto {
  word?: string;
  partOfSpeech?: string;
  pronunciation?: string;
  definition?: string;
  nuance?: string;
  personalExample?: string;
  sourceContext?: string;
  tags?: string[];
}

export interface DictionarySearchQuery {
  q?: string;
  masteryLevel?: number;
  tag?: string;
  sortBy?: 'createdAt' | 'word' | 'masteryLevel';
  sortOrder?: 'asc' | 'desc';
  skip?: number;
  take?: number;
}

// ===== Response Types =====

export interface CollocationResponse {
  id: string;
  phrase: string;
  translation?: string | null;
  example?: string | null;
  createdAt: string;
}

export interface DictionaryEntryResponse {
  id: string;
  userId: string;
  word: string;
  partOfSpeech?: string | null;
  pronunciation?: string | null;
  definition: string;
  nuance?: string | null;
  personalExample: string;
  sourceContext?: string | null;
  tags: string[];
  masteryLevel: number; // 0=new, 1=has cards, 2=mature cards
  lastReviewed?: string | null;
  collocations: CollocationResponse[];
  cardsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DictionaryStatsResponse {
  totalEntries: number;
  entriesWithCards: number;
  matureEntries: number;
  entriesNeedingCards: number;
  agingEntries: number;
  totalCollocations: number;
}

export interface DictionarySearchResult {
  id: string;
  word: string;
  partOfSpeech?: string | null;
  definition: string;
  masteryLevel: number;
}

// ===== Semantic Groups =====

export interface CreateSemanticGroupDto {
  name: string;
  description?: string;
  color?: string;
}

export interface UpdateSemanticGroupDto {
  name?: string;
  description?: string;
  color?: string;
}

export interface AddEntryToGroupsDto {
  groupIds: string[];
}

export interface SemanticGroupResponse {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  entryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RelatedWordResponse {
  id: string;
  word: string;
  definition: string;
  partOfSpeech?: string | null;
  sharedGroups: string[];
}

export interface WordWithRelatedResponse {
  entry: DictionaryEntryResponse;
  groups: SemanticGroupResponse[];
  relatedWords: RelatedWordResponse[];
}
