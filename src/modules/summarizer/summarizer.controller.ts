import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

import { SummarizerService } from './summarizer.service';
import {
  RequestSummaryDto,
  GetSummaryDto,
  SummaryRequestResponse,
  SummaryResponse,
} from './summarizer.models';

import { Authenticated } from '@/common/authenticated.decorator';
import { UserModel } from '@/app.models';

@ApiTags('summarizer')
@Controller('summarizer')
export class SummarizerController {
  constructor(private readonly summarizerService: SummarizerService) {}

  @Authenticated()
  @Post('request')
  @ApiOperation({ summary: 'Request summarization' })
  requestSummary(
    @Req() req: UserModel,
    @Body() dto: RequestSummaryDto,
  ): Promise<SummaryRequestResponse> {
    return this.summarizerService.requestSummary(
      req.user.userId,
      dto.bookId,
    );
  }

  @Authenticated()
  @Post('summary')
  @ApiOperation({ summary: 'Get summary by book id' })
  getSummary(
    @Req() req: UserModel,
    @Body() dto: GetSummaryDto,
  ): Promise<SummaryResponse> {
    return this.summarizerService.getSummaryByBookId(
      req.user.userId,
      dto.bookId,
    );
  }
}
