import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
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
} from './book.models';

import {
  PresignResponse,
  FinalizeResponse,
  BookResponse,
  CoverPresignResponse,
  UpdateLastAccessedResponse,
} from './book.models';

import { Authenticated } from '@/common/authenticated.decorator';
import { SuccessEmptyResponse, UserModel } from '@/app.models';

@ApiTags('books')
@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Authenticated()
  @Post('presign')
  @ApiOperation({ summary: 'Create book and presign upload' })
  createBookAndPresign(
    @Req() req: UserModel,
    @Body() dto: CreateBookDto,
  ): Promise<PresignResponse> {
    return this.booksService.createBookAndPresign(req.user.userId, dto);
  }

  @Authenticated()
  @Post('finalize')
  @ApiOperation({ summary: 'Finalize book upload' })
  finalizeBook(
    @Req() req: UserModel,
    @Body() dto: FinalizeBookDto,
  ): Promise<FinalizeResponse> {
    return this.booksService.finalizeBook(req.user.userId, dto.bookId);
  }

  @Authenticated()
  @Post('cover/finalize')
  @ApiOperation({ summary: 'Finalize cover upload' })
  finalizeCover(
    @Req() req: UserModel,
    @Body() dto: FinalizeCoverDto,
  ): Promise<SuccessEmptyResponse> {
    return this.booksService.finalizeCoverUpload(req.user.userId, dto.bookId);
  }

  @Authenticated()
  @Get()
  @ApiOperation({ summary: 'Get user books' })
  getAllBooks(@Req() req: UserModel): Promise<BookResponse[]> {
    return this.booksService.getAllBooks(req.user.userId);
  }

  @Authenticated()
  @Get(':id')
  @ApiOperation({ summary: 'Get book by id' })
  @ApiParam({ name: 'id' })
  getBook(
    @Req() req: UserModel,
    @Param('id') id: string,
  ): Promise<BookResponse> {
      return this.booksService.getBook(req.user.userId, id);
  }

  @Authenticated()
  @Get(':id/download')
  @ApiOperation({ summary: 'Download book file' })
  downloadBook(
    @Req() req: UserModel,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<SuccessEmptyResponse> {
    return this.booksService.downloadBook(req.user.userId, id, res);
  }

  @Authenticated()
  @Post('cover/presign')
  @ApiOperation({ summary: 'Presign cover upload' })
  coverPresign(
    @Req() req: UserModel,
    @Body() dto: PresignedUploadDto,
  ): Promise<CoverPresignResponse> {
    return this.booksService.coverPresign(req.user.userId, dto);
  }

  @Authenticated()
  @Post('cover/update')
  @ApiOperation({ summary: 'Finalize cover update' })
  updateCoverFinalize(
    @Req() req: UserModel,
    @Body() dto: CoverUpdateDto,
  ): Promise<FinalizeResponse> {
    return this.booksService.coverUpdateFinalize(req.user.userId, dto);
  }

  @Authenticated()
  @Post('last-accessed')
  @ApiOperation({ summary: 'Update last accessed time' })
  setLastAccessed(
    @Req() req: UserModel,
    @Body() dto: UpdateLastAccessedDto,
  ): Promise<UpdateLastAccessedResponse> {
    return this.booksService.setLastAccessed(dto.bookId, req.user.userId);
  }

  @Authenticated()
  @Post('time-spent')
  @ApiOperation({ summary: 'Update time spent' })
  updateTimeSpent(
    @Req() req: UserModel,
    @Body() dto: UpdateSpentTimeDto,
  ): Promise<SuccessEmptyResponse> {
    return this.booksService.updateSpentTime(req.user.userId, dto);
  }

  @Authenticated()
  @Post('favorite')
  @ApiOperation({ summary: 'Set book favorite flag' })
  setBookToFavorite(
    @Req() req: UserModel,
    @Body() dto: SetBookToFavoriteDto,
  ): Promise<SuccessEmptyResponse> {
    return this.booksService.setBookToFavorite(req.user.userId, dto);
  }
}
