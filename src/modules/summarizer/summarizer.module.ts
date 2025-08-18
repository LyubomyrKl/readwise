import { Module } from '@nestjs/common';
import { SummarizerController } from './summarizer.controller';
import { SummarizerService } from './summarizer.service';
import { RabbitMQModule } from '@/infrastructure/rabbitmq/rabbitmq.module';

@Module({
  imports: [RabbitMQModule],
  controllers: [SummarizerController],
  providers: [SummarizerService],
})
export class SummarizerModule {}