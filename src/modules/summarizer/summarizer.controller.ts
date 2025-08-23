import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SummarizerService } from './summarizer.service';
import { RequestSummaryDto, GetSummaryDto } from './summarizer.dto';
import { SummaryRequestResponse, SummaryResponse } from './summarizer.models';
import { Authenticated } from '@/common/authenticated.decorator';

@ApiTags('summarizer')
@Controller('summarizer')
export class SummarizerController {
  constructor(private readonly summarizerService: SummarizerService) {}

  @Authenticated()
  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request book summarization',
    description: 'Queues a book for summarization processing or returns existing summary key if already available',
  })
  @ApiResponse({
    status: 202,
    description: 'Summary request queued successfully or summary already exists',
    type: SummaryRequestResponse,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Book not found' })
  async requestSummary(
    @Req() req: { user: { userId: string } },
    @Body() dto: RequestSummaryDto,
  ): Promise<SummaryRequestResponse> {
    return this.summarizerService.requestSummary(req.user.userId, dto.bookId);
  }

  @Authenticated()
  @Post('get-summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get summary by book ID',
    description: 'Retrieves a summary for a specific book by its ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Summary retrieved successfully',
    type: SummaryResponse,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Book not found or summary not available' })
  async getSummary(
    @Req() req: { user: { userId: string } },
    @Body() dto: GetSummaryDto,
  ): Promise<SummaryResponse> {
    return this.summarizerService.getSummaryByBookId(req.user.userId, dto.bookId);
  }
}
