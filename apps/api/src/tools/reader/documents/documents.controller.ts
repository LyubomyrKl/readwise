import {
  Body,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Req,
  Res,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { ApiTags, ApiParam, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { DocumentsService } from './documents.service';
import {
  SetBookToFavoriteDto,
  UpdateSpentTimeDto,
  UpdateLastAccessedDto,
  BookResponse,
  UpdateLastAccessedResponse,
  UploadBookDto,
  UploadResponse,
  UpdateReadingPositionDto,
} from './document.models';
import { UPLOAD_MAX_FILE_BYTES } from './document.constants';
import { SummariesService } from '../summaries/summaries.service';

import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { SuccessEmptyResponse, UserModel } from '@platform/common/models';

/** Library endpoints of the reader tool. */
@ApiTags('reader: documents')
@Controller('reader/documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly summaries: SummariesService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'book', maxCount: 1 },
        { name: 'cover', maxCount: 1 },
      ],
      {
        // multer buffers uploads in memory; without a limit one request can exhaust it.
        limits: { fileSize: UPLOAD_MAX_FILE_BYTES, files: 2 },
      },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['book', 'title', 'author', 'description'],
      properties: {
        book: { type: 'string', format: 'binary' },
        cover: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        author: { type: 'string' },
        description: { type: 'string' },
        pageCount: { type: 'number' },
      },
    },
  })
  @ApiEndpoint({ summary: 'Upload book with optional cover', response: UploadResponse })
  uploadBook(
    @Req() req: UserModel,
    @UploadedFiles() files: { book?: Express.Multer.File[]; cover?: Express.Multer.File[] },
    @Body() dto: UploadBookDto,
  ): Promise<UploadResponse> {
    return this.documentsService.uploadBook(req.user.userId, files, dto);
  }

  @Get()
  @ApiEndpoint({ summary: 'Get user books', response: [BookResponse] })
  getAllBooks(@Req() req: UserModel): Promise<BookResponse[]> {
    return this.documentsService.getAllBooks(req.user.userId);
  }

  @Get(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Get book by id', response: BookResponse })
  getBook(@Req() req: UserModel, @Param('id') id: string): Promise<BookResponse> {
    return this.documentsService.getBook(req.user.userId, id);
  }

  @Get(':id/download')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Download book file', response: SuccessEmptyResponse })
  async downloadBook(
    @Req() req: UserModel,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.documentsService.downloadBook(req.user.userId, id, res);
  }

  @Get(':id/cover')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Get book cover image', response: SuccessEmptyResponse })
  async downloadCover(
    @Req() req: UserModel,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.documentsService.downloadCover(req.user.userId, id, res);
  }

  @Post('last-accessed')
  @ApiEndpoint({ summary: 'Update last accessed time', response: UpdateLastAccessedResponse })
  setLastAccessed(
    @Req() req: UserModel,
    @Body() dto: UpdateLastAccessedDto,
  ): Promise<UpdateLastAccessedResponse> {
    return this.documentsService.setLastAccessed(dto.bookId, req.user.userId);
  }

  @Post('time-spent')
  @ApiEndpoint({ summary: 'Update time spent', response: SuccessEmptyResponse })
  updateTimeSpent(
    @Req() req: UserModel,
    @Body() dto: UpdateSpentTimeDto,
  ): Promise<SuccessEmptyResponse> {
    return this.documentsService.updateSpentTime(req.user.userId, dto);
  }

  @Post('favorite')
  @ApiEndpoint({ summary: 'Set book favorite flag', response: SuccessEmptyResponse })
  setBookToFavorite(
    @Req() req: UserModel,
    @Body() dto: SetBookToFavoriteDto,
  ): Promise<SuccessEmptyResponse> {
    return this.documentsService.setBookToFavorite(req.user.userId, dto);
  }

  @Post('reading-position')
  @ApiEndpoint({ summary: 'Update reading position', response: SuccessEmptyResponse })
  updateReadingPosition(
    @Req() req: UserModel,
    @Body() dto: UpdateReadingPositionDto,
  ): Promise<SuccessEmptyResponse> {
    return this.documentsService.updateReadingPosition(req.user.userId, dto);
  }

  @Delete(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Delete a book', response: SuccessEmptyResponse })
  async deleteBook(
    @Req() req: UserModel,
    @Param('id') id: string,
  ): Promise<SuccessEmptyResponse> {
    // Summary objects, checkpoints and active jobs first, then the book and its own objects.
    await this.summaries.deleteForBook(req.user.userId, id);
    return this.documentsService.deleteBook(req.user.userId, id);
  }
}
