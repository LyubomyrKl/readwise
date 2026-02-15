import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiParam, ApiQuery } from '@nestjs/swagger';
import { DictionaryService } from './dictionary.service';
import {
  CreateDictionaryEntryDto,
  UpdateDictionaryEntryDto,
  CreateCollocationDto,
  DictionarySearchQueryDto,
  DictionaryEntryResponse,
  DictionaryStatsResponse,
  DictionarySearchResult,
  CollocationResponse,
  CreateSemanticGroupDto,
  UpdateSemanticGroupDto,
  AddEntryToGroupsDto,
  SemanticGroupResponse,
  WordWithRelatedResponse,
} from './dictionary.models';
import { ApiEndpoint } from '@/common/api-endpoint.decorator';
import { SuccessEmptyResponse, UserModel } from '@/app.models';
import { LearningNoteResponse } from '@/modules/learning/learning.models';

@ApiTags('dictionary')
@Controller('dictionary')
export class DictionaryController {
  constructor(private readonly dictionaryService: DictionaryService) {}

  // ===== Entries =====

  @Get('entries')
  @ApiEndpoint({ summary: 'Get dictionary entries', response: [DictionaryEntryResponse] })
  getEntries(
    @Req() req: UserModel,
    @Query() query: DictionarySearchQueryDto,
  ): Promise<DictionaryEntryResponse[]> {
    return this.dictionaryService.getEntries(req.user.userId, query);
  }

  @Get('entries/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Get a single dictionary entry', response: DictionaryEntryResponse })
  getEntry(
    @Req() req: UserModel,
    @Param('id') id: string,
  ): Promise<DictionaryEntryResponse> {
    return this.dictionaryService.getEntry(req.user.userId, id);
  }

  @Post('entries')
  @ApiEndpoint({ summary: 'Create a dictionary entry', response: DictionaryEntryResponse })
  createEntry(
    @Req() req: UserModel,
    @Body() dto: CreateDictionaryEntryDto,
  ): Promise<DictionaryEntryResponse> {
    return this.dictionaryService.createEntry(req.user.userId, dto);
  }

  @Patch('entries/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Update a dictionary entry', response: DictionaryEntryResponse })
  updateEntry(
    @Req() req: UserModel,
    @Param('id') id: string,
    @Body() dto: UpdateDictionaryEntryDto,
  ): Promise<DictionaryEntryResponse> {
    return this.dictionaryService.updateEntry(req.user.userId, id, dto);
  }

  @Delete('entries/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Delete a dictionary entry', response: SuccessEmptyResponse })
  async deleteEntry(
    @Req() req: UserModel,
    @Param('id') id: string,
  ): Promise<SuccessEmptyResponse> {
    await this.dictionaryService.deleteEntry(req.user.userId, id);
    return { status: 'success' };
  }

  // ===== Collocations =====

  @Post('entries/:id/collocations')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Add collocation to entry', response: CollocationResponse })
  addCollocation(
    @Req() req: UserModel,
    @Param('id') id: string,
    @Body() dto: CreateCollocationDto,
  ): Promise<CollocationResponse> {
    return this.dictionaryService.addCollocation(req.user.userId, id, dto);
  }

  @Delete('entries/:id/collocations/:collocationId')
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'collocationId' })
  @ApiEndpoint({ summary: 'Remove collocation from entry', response: SuccessEmptyResponse })
  async removeCollocation(
    @Req() req: UserModel,
    @Param('id') id: string,
    @Param('collocationId') collocationId: string,
  ): Promise<SuccessEmptyResponse> {
    await this.dictionaryService.removeCollocation(req.user.userId, id, collocationId);
    return { status: 'success' };
  }

  // ===== Card Generation =====

  @Post('entries/:id/create-cards')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Create learning cards from entry', response: LearningNoteResponse })
  createCardsFromEntry(
    @Req() req: UserModel,
    @Param('id') id: string,
  ): Promise<LearningNoteResponse> {
    return this.dictionaryService.createCardsFromEntry(req.user.userId, id);
  }

  // ===== Statistics =====

  @Get('stats')
  @ApiEndpoint({ summary: 'Get dictionary statistics', response: DictionaryStatsResponse })
  getStats(@Req() req: UserModel): Promise<DictionaryStatsResponse> {
    return this.dictionaryService.getStats(req.user.userId);
  }

  // ===== Search =====

  @Get('search')
  @ApiQuery({ name: 'q', required: true, description: 'Search query (word prefix)' })
  @ApiEndpoint({ summary: 'Search entries by word prefix', response: [DictionarySearchResult] })
  searchEntries(
    @Req() req: UserModel,
    @Query('q') query: string,
  ): Promise<DictionarySearchResult[]> {
    return this.dictionaryService.searchEntries(req.user.userId, query);
  }

  // ===== Semantic Groups =====

  @Get('groups')
  @ApiEndpoint({ summary: 'Get all semantic groups', response: [SemanticGroupResponse] })
  getGroups(@Req() req: UserModel): Promise<SemanticGroupResponse[]> {
    return this.dictionaryService.getGroups(req.user.userId);
  }

  @Post('groups')
  @ApiEndpoint({ summary: 'Create a semantic group', response: SemanticGroupResponse })
  createGroup(
    @Req() req: UserModel,
    @Body() dto: CreateSemanticGroupDto,
  ): Promise<SemanticGroupResponse> {
    return this.dictionaryService.createGroup(req.user.userId, dto);
  }

  @Patch('groups/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Update a semantic group', response: SemanticGroupResponse })
  updateGroup(
    @Req() req: UserModel,
    @Param('id') id: string,
    @Body() dto: UpdateSemanticGroupDto,
  ): Promise<SemanticGroupResponse> {
    return this.dictionaryService.updateGroup(req.user.userId, id, dto);
  }

  @Delete('groups/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Delete a semantic group', response: SuccessEmptyResponse })
  async deleteGroup(
    @Req() req: UserModel,
    @Param('id') id: string,
  ): Promise<SuccessEmptyResponse> {
    await this.dictionaryService.deleteGroup(req.user.userId, id);
    return { status: 'success' };
  }

  @Get('groups/:id/entries')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Get all entries in a semantic group', response: [DictionarySearchResult] })
  getGroupEntries(
    @Req() req: UserModel,
    @Param('id') id: string,
  ): Promise<DictionarySearchResult[]> {
    return this.dictionaryService.getGroupEntries(req.user.userId, id);
  }

  // ===== Entry-Group Management =====

  @Post('entries/:id/groups')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Add entry to semantic groups', response: SuccessEmptyResponse })
  async addEntryToGroups(
    @Req() req: UserModel,
    @Param('id') id: string,
    @Body() dto: AddEntryToGroupsDto,
  ): Promise<SuccessEmptyResponse> {
    await this.dictionaryService.addEntryToGroups(req.user.userId, id, dto.groupIds);
    return { status: 'success' };
  }

  @Delete('entries/:id/groups/:groupId')
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'groupId' })
  @ApiEndpoint({ summary: 'Remove entry from a semantic group', response: SuccessEmptyResponse })
  async removeEntryFromGroup(
    @Req() req: UserModel,
    @Param('id') id: string,
    @Param('groupId') groupId: string,
  ): Promise<SuccessEmptyResponse> {
    await this.dictionaryService.removeEntryFromGroup(req.user.userId, id, groupId);
    return { status: 'success' };
  }

  @Get('entries/:id/groups')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Get groups for an entry', response: [SemanticGroupResponse] })
  getEntryGroups(
    @Req() req: UserModel,
    @Param('id') id: string,
  ): Promise<SemanticGroupResponse[]> {
    return this.dictionaryService.getEntryGroups(req.user.userId, id);
  }

  // ===== Word Lookup with Related =====

  @Get('word/:term')
  @ApiParam({ name: 'term', description: 'The word to look up' })
  @ApiEndpoint({ summary: 'Get word with its groups and related words', response: WordWithRelatedResponse })
  getWordWithRelated(
    @Req() req: UserModel,
    @Param('term') term: string,
  ): Promise<WordWithRelatedResponse> {
    return this.dictionaryService.getWordWithRelated(req.user.userId, term);
  }
}
