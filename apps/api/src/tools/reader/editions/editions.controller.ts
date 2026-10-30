import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { EditionsService } from './editions.service';
import {
  CreateEditionDto,
  CreateEditionResponse,
  DocumentStructureResponse,
  EditionProgressResponse,
  EditionResponse,
} from './edition.models';

@ApiTags('reader: editions')
@Controller()
export class EditionsController {
  constructor(private readonly editions: EditionsService) {}

  @Post('reader/documents/:id/editions')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Make an abridged edition of a document (EPUB, added to the library)', response: CreateEditionResponse })
  create(@Req() req: UserModel, @Param('id') bookId: string, @Body() dto: CreateEditionDto): Promise<CreateEditionResponse> {
    return this.editions.create(req.user.userId, bookId, dto);
  }

  @Get('reader/documents/:id/editions')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'The abridged editions of a document, newest first', response: [EditionResponse] })
  list(@Req() req: UserModel, @Param('id') bookId: string): Promise<EditionResponse[]> {
    return this.editions.listForBook(req.user.userId, bookId);
  }

  @Get('reader/editions/:editionId')
  @ApiParam({ name: 'editionId' })
  @ApiEndpoint({ summary: 'An edition and the state of its job', response: EditionResponse })
  get(@Req() req: UserModel, @Param('editionId') editionId: string): Promise<EditionResponse> {
    return this.editions.get(req.user.userId, editionId);
  }

  @Get('reader/editions/:editionId/progress')
  @ApiParam({ name: 'editionId' })
  @ApiEndpoint({ summary: 'Chapter-by-chapter progress of an edition being made', response: EditionProgressResponse })
  progress(@Req() req: UserModel, @Param('editionId') editionId: string): Promise<EditionProgressResponse> {
    return this.editions.progress(req.user.userId, editionId);
  }

  @Get('reader/documents/:id/structure')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'The document as read on upload: contents, kinds, sizes, language (404 until read)', response: DocumentStructureResponse })
  structure(@Req() req: UserModel, @Param('id') bookId: string): Promise<DocumentStructureResponse> {
    return this.editions.structure(req.user.userId, bookId);
  }
}
