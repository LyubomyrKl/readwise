import { Controller, Get, MessageEvent, Param, Post, Query, Req, Sse } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { Job } from '@prisma/client';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { Authenticated } from '@platform/common/authenticated.decorator';
import { UserModel } from '@platform/common/models';
import { JobsService } from './jobs.service';
import { JobResponse, ListJobsQuery, toJobResponse } from './job.models';
import { isActive } from './job-hooks';

/** Keeps proxies and browsers from closing an idle stream (seconds). */
const SSE_KEEPALIVE_MS = 25_000;

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

  /**
   * Server-sent events: the job as it changes, starting with its current state,
   * one `job` event per change, closed after the terminal state. A comment line
   * every 25 s keeps the connection alive through proxies.
   */
  @Sse(':id/stream')
  @ApiParam({ name: 'id' })
  @Authenticated()
  stream(@Req() req: UserModel, @Param('id') id: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      const send = (job: Job) => {
        if (closed) return;
        subscriber.next({ type: 'job', data: toJobResponse(job) });
        if (!isActive(job.status)) {
          closed = true;
          subscriber.complete();
        }
      };
      const onChange = (job: Job) => send(job);
      const keepalive = setInterval(() => {
        if (!closed) subscriber.next({ type: 'keepalive', data: '' });
      }, SSE_KEEPALIVE_MS);

      this.jobs
        .get(req.user.userId, id)
        .then((job) => {
          send(job);
          if (!closed) this.jobs.changes.on(`job:${id}`, onChange);
        })
        .catch((error: unknown) => subscriber.error(error));

      return () => {
        closed = true;
        clearInterval(keepalive);
        this.jobs.changes.off(`job:${id}`, onChange);
      };
    });
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
