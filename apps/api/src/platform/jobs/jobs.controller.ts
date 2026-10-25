import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { JobsService } from './jobs.service';
import { JobResponse, ListJobsQuery, toJobResponse } from './job.models';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @ApiEndpoint({ summary: 'List my jobs, newest first', response: [JobResponse] })
  async list(@Req() req: UserModel, @Query() query: ListJobsQuery): Promise<JobResponse[]> {
    const jobs = await this.jobs.list(req.user.userId, query);
    return jobs.map(toJobResponse);
  }

  @Get(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Get a job', response: JobResponse })
  async get(@Req() req: UserModel, @Param('id') id: string): Promise<JobResponse> {
    return toJobResponse(await this.jobs.get(req.user.userId, id));
  }

  @Post(':id/cancel')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Cancel a queued, running or waiting job', response: JobResponse })
  async cancel(@Req() req: UserModel, @Param('id') id: string): Promise<JobResponse> {
    return toJobResponse(await this.jobs.cancel(req.user.userId, id));
  }

  @Post(':id/retry')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Re-run a failed or cancelled job', response: JobResponse })
  async retry(@Req() req: UserModel, @Param('id') id: string): Promise<JobResponse> {
    return toJobResponse(await this.jobs.retry(req.user.userId, id));
  }
}
