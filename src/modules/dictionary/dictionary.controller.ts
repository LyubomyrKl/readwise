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
}
