import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiParam } from '@nestjs/swagger';
import { LearningService } from './learning.service';
import {
  CreateLearningNoteDto,
  UpdateLearningNoteDto,
  ValidateNoteDto,
  SubmitReviewDto,
  EndSessionDto,
  UpdateSettingsDto,
  ValidationResultResponse,
  LearningNoteResponse,
  StudyQueueResponse,
  SessionStartResponse,
  ReviewResultResponse,
  StatsResponse,
  DailyStatsResponse,
  SettingsResponse,
} from './learning.models';
import { ApiEndpoint } from '@/common/api-endpoint.decorator';
import { SuccessEmptyResponse, UserModel } from '@/app.models';

@ApiTags('learning')
@Controller('learning')
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  // ===== Notes =====

  @Get('notes')
  @ApiEndpoint({ summary: 'Get all learning notes', response: [LearningNoteResponse] })
  getNotes(@Req() req: UserModel): Promise<LearningNoteResponse[]> {
    return this.learningService.getNotes(req.user.userId);
  }

  @Get('notes/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Get a specific learning note', response: LearningNoteResponse })
  getNote(
    @Req() req: UserModel,
    @Param('id') id: string,
  ): Promise<LearningNoteResponse> {
    return this.learningService.getNote(req.user.userId, id);
  }

  @Post('notes')
  @ApiEndpoint({ summary: 'Create a learning note', response: LearningNoteResponse })
  createNote(
    @Req() req: UserModel,
    @Body() dto: CreateLearningNoteDto,
  ): Promise<LearningNoteResponse> {
    return this.learningService.createNote(req.user.userId, dto);
  }

  @Post('notes/validate')
  @ApiEndpoint({ summary: 'Validate note content', response: ValidationResultResponse })
  validateNote(@Body() dto: ValidateNoteDto): ValidationResultResponse {
    return this.learningService.validateNote(dto);
  }

  @Post('notes/from-highlight/:highlightId')
  @ApiParam({ name: 'highlightId' })
  @ApiEndpoint({ summary: 'Create note from highlight', response: LearningNoteResponse })
  createNoteFromHighlight(
    @Req() req: UserModel,
    @Param('highlightId') highlightId: string,
    @Body() dto: CreateLearningNoteDto,
  ): Promise<LearningNoteResponse> {
    return this.learningService.createNoteFromHighlight(
      req.user.userId,
      highlightId,
      dto,
    );
  }

  @Patch('notes/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Update a learning note', response: LearningNoteResponse })
  updateNote(
    @Req() req: UserModel,
    @Param('id') id: string,
    @Body() dto: UpdateLearningNoteDto,
  ): Promise<LearningNoteResponse> {
    return this.learningService.updateNote(req.user.userId, id, dto);
  }

  @Delete('notes/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Delete a learning note', response: SuccessEmptyResponse })
  async deleteNote(
    @Req() req: UserModel,
    @Param('id') id: string,
  ): Promise<SuccessEmptyResponse> {
    await this.learningService.deleteNote(req.user.userId, id);
    return { status: 'success' };
  }

  // ===== Study Session =====

  @Get('study/queue')
  @ApiEndpoint({ summary: 'Get cards due for study', response: StudyQueueResponse })
  getStudyQueue(@Req() req: UserModel): Promise<StudyQueueResponse> {
    return this.learningService.getStudyQueue(req.user.userId);
  }

  @Post('study/session/start')
  @ApiEndpoint({ summary: 'Start a study session', response: SessionStartResponse })
  startSession(@Req() req: UserModel): Promise<SessionStartResponse> {
    return this.learningService.startSession(req.user.userId);
  }

  @Post('study/session/end')
  @ApiEndpoint({ summary: 'End a study session', response: SuccessEmptyResponse })
  async endSession(
    @Req() req: UserModel,
    @Body() dto: EndSessionDto,
  ): Promise<SuccessEmptyResponse> {
    await this.learningService.endSession(req.user.userId, dto);
    return { status: 'success' };
  }

  @Post('study/review')
  @ApiEndpoint({ summary: 'Submit a card review', response: ReviewResultResponse })
  submitReview(
    @Req() req: UserModel,
    @Body() dto: SubmitReviewDto,
  ): Promise<ReviewResultResponse> {
    return this.learningService.submitReview(req.user.userId, dto);
  }

  // ===== Statistics =====

  @Get('stats')
  @ApiEndpoint({ summary: 'Get learning statistics', response: StatsResponse })
  getStats(@Req() req: UserModel): Promise<StatsResponse> {
    return this.learningService.getStats(req.user.userId);
  }

  @Get('stats/daily')
  @ApiEndpoint({ summary: 'Get daily statistics', response: [DailyStatsResponse] })
  getDailyStats(@Req() req: UserModel): Promise<DailyStatsResponse[]> {
    return this.learningService.getDailyStats(req.user.userId);
  }

  // ===== Settings =====

  @Get('settings')
  @ApiEndpoint({ summary: 'Get learning settings', response: SettingsResponse })
  getSettings(@Req() req: UserModel): Promise<SettingsResponse> {
    return this.learningService.getSettings(req.user.userId);
  }

  @Patch('settings')
  @ApiEndpoint({ summary: 'Update learning settings', response: SettingsResponse })
  updateSettings(
    @Req() req: UserModel,
    @Body() dto: UpdateSettingsDto,
  ): Promise<SettingsResponse> {
    return this.learningService.updateSettings(req.user.userId, dto);
  }
}
