import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { QueueModule } from '@platform/queue/queue.module';

// PrismaModule and StorageModule are global; the queue module is imported explicitly.
@Module({
  imports: [QueueModule],
  controllers: [HealthController],
})
export class HealthModule {}
