import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { SummariesService } from './summaries.service';
import {
  CreateSummaryDto,
  CreateSummaryResponse,
  ListSummariesQuery,
  SummaryContentResponse,
  SummaryResponse,
} from './summary.models';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';

@ApiTags('reader: summaries')
@Controller()
export class SummariesController {
  constructor(private readonly summaries: SummariesService) {}

  @Post('reader/documents/:id/summaries')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Request a summary of a document', response: CreateSummaryResponse })
  create(
    @Req() req: UserModel,
    @Param('id') bookId: string,
    @Body() dto: CreateSummaryDto,
  ): Promise<CreateSummaryResponse> {
    return this.summaries.create(req.user.userId, bookId, dto.summaryType, dto.summarizationStrategy);
  }

  @Get('reader/documents/:id/summaries')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'List the summaries of a document, newest first', response: [SummaryResponse] })
  list(@Req() req: UserModel, @Param('id') bookId: string): Promise<SummaryResponse[]> {
    return this.summaries.listForBook(req.user.userId, bookId);
  }

  @Get('reader/summaries')
  @ApiEndpoint({ summary: 'All my summaries, newest first (latestPerBook=true: one per document)', response: [SummaryResponse] })
  listAll(@Req() req: UserModel, @Query() query: ListSummariesQuery): Promise<SummaryResponse[]> {
    return this.summaries.listForUser(req.user.userId, query);
  }

  @Get('reader/summaries/:summaryId')
  @ApiParam({ name: 'summaryId' })
  @ApiEndpoint({ summary: 'A summary and the state of its job', response: SummaryResponse })
  get(@Req() req: UserModel, @Param('summaryId') summaryId: string): Promise<SummaryResponse> {
    return this.summaries.get(req.user.userId, summaryId);
  }

  @Get('reader/summaries/:summaryId/content')
  @ApiParam({ name: 'summaryId' })
  @ApiEndpoint({ summary: 'The summary JSON (404 until the job succeeded)', response: SummaryContentResponse })
  content(@Req() req: UserModel, @Param('summaryId') summaryId: string): Promise<SummaryContentResponse> {
    return this.summaries.getContent(req.user.userId, summaryId);
  }
}
