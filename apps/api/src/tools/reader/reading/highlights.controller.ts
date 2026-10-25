import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiParam } from '@nestjs/swagger';
import { HighlightsService } from './highlights.service';
import {
  CreateHighlightDto,
  UpdateHighlightDto,
  HighlightResponse,
} from './highlight.models';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { SuccessEmptyResponse, UserModel } from '@platform/common/models';

// Paths: the reader's own prefix plus the pre-Phase-4 aliases, dropped in Phase 5.
@ApiTags('highlights')
@Controller()
export class HighlightsController {
  constructor(private readonly highlightsService: HighlightsService) {}

  @Get(['books/:bookId/highlights', 'reader/documents/:bookId/highlights'])
  @ApiParam({ name: 'bookId' })
  @ApiEndpoint({ summary: 'Get all highlights for a book', response: [HighlightResponse] })
  getHighlightsForBook(
    @Req() req: UserModel,
    @Param('bookId') bookId: string,
  ): Promise<HighlightResponse[]> {
    return this.highlightsService.getHighlightsForBook(req.user.userId, bookId);
  }

  @Post(['books/:bookId/highlights', 'reader/documents/:bookId/highlights'])
  @ApiParam({ name: 'bookId' })
  @ApiEndpoint({ summary: 'Create a new highlight', response: HighlightResponse })
  createHighlight(
    @Req() req: UserModel,
    @Param('bookId') bookId: string,
    @Body() dto: CreateHighlightDto,
  ): Promise<HighlightResponse> {
    return this.highlightsService.createHighlight(req.user.userId, bookId, dto);
  }

  @Patch(['highlights/:id', 'reader/highlights/:id'])
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Update a highlight', response: HighlightResponse })
  updateHighlight(
    @Req() req: UserModel,
    @Param('id') id: string,
    @Body() dto: UpdateHighlightDto,
  ): Promise<HighlightResponse> {
    return this.highlightsService.updateHighlight(req.user.userId, id, dto);
  }

  @Delete(['highlights/:id', 'reader/highlights/:id'])
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Delete a highlight', response: SuccessEmptyResponse })
  async deleteHighlight(
    @Req() req: UserModel,
    @Param('id') id: string,
  ): Promise<SuccessEmptyResponse> {
    await this.highlightsService.deleteHighlight(req.user.userId, id);
    return { status: 'success' };
  }
}
