import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { SummarizerService } from './summarizer.service';
import { RequestSummaryDto } from './summarizer.dto';
import { SummaryRequestResponse } from './summarizer.models';
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
    description: 'Queues a book for summarization processing',
  })
  @ApiResponse({
    status: 202,
    description: 'Summary request queued successfully',
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
}