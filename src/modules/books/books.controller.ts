import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiParam } from '@nestjs/swagger';
import type { Response } from 'express';

import { BooksService } from './books.service';
import {
  CreateBookDto,
  FinalizeBookDto,
  FinalizeCoverDto,
  PresignedUploadDto,
  SetBookToFavoriteDto,
  UpdateSpentTimeDto,
  CoverUpdateDto,
  UpdateLastAccessedDto,
  PresignResponse,
  FinalizeResponse,
  BookResponse,
  CoverPresignResponse,
  UpdateLastAccessedResponse,
} from './book.models';

import { ApiEndpoint } from '@/common/api-endpoint.decorator';
import { SuccessEmptyResponse, UserModel } from '@/app.models';

@ApiTags('books')
@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post('presign')
  @ApiEndpoint({ summary: 'Create book and presign upload', response: PresignResponse })
  createBookAndPresign(
    @Req() req: UserModel,
    @Body() dto: CreateBookDto,
  ): Promise<PresignResponse> {
    return this.booksService.createBookAndPresign(req.user.userId, dto);
  }

  @Post('finalize')
  @ApiEndpoint({ summary: 'Finalize book upload', response: FinalizeResponse })
  finalizeBook(
    @Req() req: UserModel,
    @Body() dto: FinalizeBookDto,
  ): Promise<FinalizeResponse> {
    return this.booksService.finalizeBook(req.user.userId, dto.bookId);
  }

  @Post('cover/finalize')
  @ApiEndpoint({ summary: 'Finalize cover upload', response: SuccessEmptyResponse })
  finalizeCover(
    @Req() req: UserModel,
    @Body() dto: FinalizeCoverDto,
  ): Promise<SuccessEmptyResponse> {
    return this.booksService.finalizeCoverUpload(req.user.userId, dto.bookId);
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
  downloadBook(
    @Req() req: UserModel,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<SuccessEmptyResponse> {
    return this.booksService.downloadBook(req.user.userId, id, res);
  }

  @Post('cover/presign')
  @ApiEndpoint({ summary: 'Presign cover upload', response: CoverPresignResponse })
  coverPresign(
    @Req() req: UserModel,
    @Body() dto: PresignedUploadDto,
  ): Promise<CoverPresignResponse> {
    return this.booksService.coverPresign(req.user.userId, dto);
  }

  @Post('cover/update')
  @ApiEndpoint({ summary: 'Finalize cover update', response: FinalizeResponse })
  updateCoverFinalize(
    @Req() req: UserModel,
    @Body() dto: CoverUpdateDto,
  ): Promise<FinalizeResponse> {
    return this.booksService.coverUpdateFinalize(req.user.userId, dto);
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
}