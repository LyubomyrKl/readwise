import { Module } from '@nestjs/common';
import { QueueModule } from '@platform/queue/queue.module';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { JobEventsConsumer } from './job-events.consumer';
import { NodeJobRunner } from './node-job-runner';

@Module({
  imports: [QueueModule],
  controllers: [JobsController],
  providers: [JobsService, JobEventsConsumer, NodeJobRunner],
  exports: [JobsService, NodeJobRunner],
})
export class JobsModule {}
