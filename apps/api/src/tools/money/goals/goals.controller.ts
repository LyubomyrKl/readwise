import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { RemovedResponse } from '../drafts/drafts.controller';
import { CreateGoalDto, GoalResponse } from './goals.models';
import { GoalsService } from './goals.service';

@ApiTags('money')
@Controller('money/goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  @ApiEndpoint({ summary: 'Finish lines: the net worths to reach, smallest first', response: [GoalResponse] })
  list(@Req() req: UserModel) {
    return this.goals.list(req.user.userId);
  }

  @Post()
  @ApiEndpoint({ summary: 'Set a finish line: a net worth to reach', response: GoalResponse })
  create(@Req() req: UserModel, @Body() dto: CreateGoalDto) {
    return this.goals.create(req.user.userId, dto);
  }

  @Delete(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Remove a finish line', response: RemovedResponse })
  async remove(@Req() req: UserModel, @Param('id') id: string): Promise<{ removed: true }> {
    await this.goals.remove(req.user.userId, id);
    return { removed: true };
  }
}
