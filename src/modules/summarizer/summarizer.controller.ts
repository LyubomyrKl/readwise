import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { SummarizerService } from './summarizer.service';
import {
  RequestSummaryDto,
  GetSummaryDto,
  SummaryRequestResponse,
  SummaryResponse,
} from './summarizer.models';

import { ApiEndpoint } from '@/common/api-endpoint.decorator';
import { UserModel } from '@/app.models';

@ApiTags('summarizer')
@Controller('summarizer')
export class SummarizerController {
  constructor(private readonly summarizerService: SummarizerService) {}

  @Post('request')
  @ApiEndpoint({ summary: 'Request summarization', response: SummaryRequestResponse })
  requestSummary(
    @Req() req: UserModel,
    @Body() dto: RequestSummaryDto,
  ): Promise<SummaryRequestResponse> {
    return this.summarizerService.requestSummary(
      req.user.userId,
      dto.bookId,
      dto.summaryType ?? 'extractive',
      dto.summarizationStrategy,
    );
  }

  @Post('summary')
  @ApiEndpoint({ summary: 'Get summary by book id', response: SummaryResponse })
  getSummary(
    @Req() req: UserModel,
    @Body() dto: GetSummaryDto,
  ): Promise<SummaryResponse> {
    return this.summarizerService.getSummaryByBookId(req.user.userId, dto.bookId);
  }
}
