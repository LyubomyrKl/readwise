import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { BooksService } from './books.service';
import { CreateBookDto, FinalizeBookDto } from './book.dto';
import { PresignResponse, FinalizeResponse, BookResponse } from './book.models';
import { Authenticated } from '@/common/authenticated.decorator';

@ApiTags('books')
@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Authenticated()
  @Post('presign')
  @ApiOperation({ summary: 'Create book record and get presigned upload URL' })
  async presign(
    @Req() req: { user: { userId: string } },
    @Body() dto: CreateBookDto,
  ): Promise<PresignResponse> {
    return await this.booksService.createBookAndPresign(req.user.userId, dto);
  }

  @Authenticated()
  @Post('finalize')
  @ApiOperation({ summary: 'Mark book upload as complete' })
  async finalize(
    @Req() req: { user: { userId: string } },
    @Body() dto: FinalizeBookDto,
  ): Promise<FinalizeResponse> {
    return await this.booksService.finalizeBook(req.user.userId, dto.bookId);
  }

  @Authenticated()
  @Get(':id')
  @ApiOperation({ summary: 'Get book metadata' })
  async getBook(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ): Promise<BookResponse> {
    return await this.booksService.getBook(req.user.userId, id);
  }

  @Authenticated()
  @Get(':id/download')
  @ApiOperation({ summary: 'Download book file with Range support' })
  async downloadBook(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    await this.booksService.downloadBook(
      req.user.userId,
      id,
      range,
      res,
    );
  }
}
