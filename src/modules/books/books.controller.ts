import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { BooksService } from './books.service';
import {
  CreateBookDto,
  FinalizeBookDto,
  FinalizeCoverDto,
  PresignedUploadDto,
} from './book.models';
import {
  PresignResponse,
  FinalizeResponse,
  BookResponse,
  CoverPresignResponse,
  CoverUpdateDto,
  UpdateLastAccessedDto,
  UpdateLastAccessedResponse,
} from './book.models';
import { Authenticated } from '@/common/authenticated.decorator';

@ApiTags('books')
@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Authenticated()
  @Post('presign')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create book record and get presigned upload URLs',
    description:
      'Creates a new book record and returns presigned URLs for uploading both the book file and optional custom cover',
  })
  @ApiResponse({
    status: 201,
    description: 'Book created successfully',
    type: PresignResponse,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createBookAndPresign(
    @Req() req: { user: { userId: string } },
    @Body() dto: CreateBookDto,
  ): Promise<PresignResponse> {
    return this.booksService.createBookAndPresign(req.user.userId, dto);
  }

  @Authenticated()
  @Post('/cover/finalize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finalize cover upload',
    description: 'Verifies the uploaded cover file and links it to the book',
  })
  @ApiResponse({ status: 200, description: 'Cover finalized successfully' })
  @ApiResponse({ status: 400, description: 'Cover file not found in storage' })
  @ApiResponse({ status: 404, description: 'Book not found' })
  async finalizeCover(
    @Req() req: { user: { userId: string } },
    @Body() dto: FinalizeCoverDto,
  ): Promise<{ success: boolean }> {
    return this.booksService.finalizeCoverUpload(req.user.userId, dto.bookId);
  }

  @Authenticated()
  @Post('finalize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Finalize book upload',
    description:
      'Verifies uploaded files, calculates hash, and marks book as ready',
  })
  @ApiResponse({
    status: 200,
    description: 'Book finalized successfully',
    type: FinalizeResponse,
  })
  @ApiResponse({ status: 400, description: 'File validation failed' })
  @ApiResponse({
    status: 404,
    description: 'Book not found or already finalized',
  })
  async finalizeBook(
    @Req() req: { user: { userId: string } },
    @Body() dto: FinalizeBookDto,
  ): Promise<FinalizeResponse> {
    return this.booksService.finalizeBook(req.user.userId, dto.bookId);
  }

  @Authenticated()
  @Get()
  @ApiOperation({
    summary: 'Get all user books',
    description:
      'Retrieves all books for the authenticated user (excludes pending and error statuses)',
  })
  @ApiResponse({
    status: 200,
    description: 'Books retrieved successfully',
    type: [BookResponse],
  })
  async getAllBooks(
    @Req() req: { user: { userId: string } },
  ): Promise<BookResponse[]> {
    return this.booksService.getAllBooks(req.user.userId);
  }

  @Authenticated()
  @Get(':id')
  @ApiOperation({
    summary: 'Get book by ID',
    description: 'Retrieves detailed information about a specific book',
  })
  @ApiParam({ name: 'id', description: 'Book ID' })
  @ApiResponse({
    status: 200,
    description: 'Book retrieved successfully',
    type: BookResponse,
  })
  @ApiResponse({ status: 404, description: 'Book not found' })
  async getBook(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ): Promise<BookResponse> {
    return this.booksService.getBook(req.user.userId, id);
  }

  @Authenticated()
  @Get(':id/download')
  @ApiOperation({
    summary: 'Download book file',
    description:
      'Downloads the book file with support for HTTP Range requests (partial downloads)',
  })
  @ApiParam({ name: 'id', description: 'Book ID' })
  @ApiHeader({
    name: 'Range',
    description: 'HTTP Range header for partial downloads',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Book file download started' })
  @ApiResponse({ status: 206, description: 'Partial content (Range request)' })
  @ApiResponse({ status: 404, description: 'Book not found or not ready' })
  @ApiResponse({ status: 416, description: 'Range not satisfiable' })
  async downloadBook(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    return this.booksService.downloadBook(req.user.userId, id, range, res);
  }

  @Authenticated()
  @Post('cover/update')
  @ApiOperation({
    summary: 'Prepare book cover upload',
    description:
      'Prepares the book cover for upload, returning necessary metadata and presigned URL',
  })
  async coverPresign(
    @Req() req: { user: { userId: string } },
    @Body() dto: PresignedUploadDto,
  ): Promise<CoverPresignResponse> {
    return await this.booksService.coverPresign(req.user.userId, dto);
  }

  @Authenticated()
  @Post('cover/update/finalize')
  @ApiOperation({
    summary: 'Finalize book cover upload',
    description:
      'Finalizes the book cover upload, returning necessary metadata and presigned URL',
  })
  async updateCoverFinalize(
    @Req() req: { user: { userId: string } },
    @Body() dto: CoverUpdateDto,
  ): Promise<FinalizeResponse> {
    return await this.booksService.coverUpdateFinalize(req.user.userId, dto);
  }

  @Authenticated()
  @Post(':id')
  @ApiOperation({
    summary: 'Set last accessed file date'
  })
  async setLastAccessed(
    @Body() dto: UpdateLastAccessedDto,
  ): Promise<UpdateLastAccessedResponse> {
    return await this.booksService.setLastAccessed(dto.bookId);
  }
}
