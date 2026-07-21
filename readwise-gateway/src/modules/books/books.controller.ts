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

import { BooksService } from './books.service';
import {
  SetBookToFavoriteDto,
  UpdateSpentTimeDto,
  UpdateLastAccessedDto,
  BookResponse,
  UpdateLastAccessedResponse,
  UploadBookDto,
  UploadResponse,
  UpdateReadingPositionDto,
} from './book.models';

import { ApiEndpoint } from '@/common/api-endpoint.decorator';
import { SuccessEmptyResponse, UserModel } from '@/app.models';

@ApiTags('books')
@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post('upload')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'book', maxCount: 1 },
      { name: 'cover', maxCount: 1 },
    ]),
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
    return this.booksService.uploadBook(req.user.userId, files, dto);
  }

  @Get()
  @ApiEndpoint({ summary: 'Get user books', response: [BookResponse] })
  getAllBooks(@Req() req: UserModel): Promise<BookResponse[]> {
    return this.booksService.getAllBooks(req.user.userId);
  }

  @Get(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Get book by id', response: BookResponse })
  getBook(
    @Req() req: UserModel,
    @Param('id') id: string,
  ): Promise<BookResponse> {
    return this.booksService.getBook(req.user.userId, id);
  }

  @Get(':id/download')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Download book file', response: SuccessEmptyResponse })
  async downloadBook(
    @Req() req: UserModel,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.booksService.downloadBook(req.user.userId, id, res);
  }

  @Get(':id/cover')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Get book cover image', response: SuccessEmptyResponse })
  async downloadCover(
    @Req() req: UserModel,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.booksService.downloadCover(req.user.userId, id, res);
  }

  @Post('last-accessed')
  @ApiEndpoint({ summary: 'Update last accessed time', response: UpdateLastAccessedResponse })
  setLastAccessed(
    @Req() req: UserModel,
    @Body() dto: UpdateLastAccessedDto,
  ): Promise<UpdateLastAccessedResponse> {
    return this.booksService.setLastAccessed(dto.bookId, req.user.userId);
  }

  @Post('time-spent')
  @ApiEndpoint({ summary: 'Update time spent', response: SuccessEmptyResponse })
  updateTimeSpent(
    @Req() req: UserModel,
    @Body() dto: UpdateSpentTimeDto,
  ): Promise<SuccessEmptyResponse> {
    return this.booksService.updateSpentTime(req.user.userId, dto);
  }

  @Post('favorite')
  @ApiEndpoint({ summary: 'Set book favorite flag', response: SuccessEmptyResponse })
  setBookToFavorite(
    @Req() req: UserModel,
    @Body() dto: SetBookToFavoriteDto,
  ): Promise<SuccessEmptyResponse> {
    return this.booksService.setBookToFavorite(req.user.userId, dto);
  }

  @Post('reading-position')
  @ApiEndpoint({ summary: 'Update reading position', response: SuccessEmptyResponse })
  updateReadingPosition(
    @Req() req: UserModel,
    @Body() dto: UpdateReadingPositionDto,
  ): Promise<SuccessEmptyResponse> {
    return this.booksService.updateReadingPosition(req.user.userId, dto);
  }

  @Delete(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Delete a book', response: SuccessEmptyResponse })
  deleteBook(
    @Req() req: UserModel,
    @Param('id') id: string,
  ): Promise<SuccessEmptyResponse> {
    return this.booksService.deleteBook(req.user.userId, id);
  }
}
