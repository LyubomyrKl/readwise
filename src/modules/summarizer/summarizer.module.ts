import { Module } from '@nestjs/common';
import { SummarizerController } from './summarizer.controller';
import { SummarizerService } from './summarizer.service';
import { RabbitMQModule } from '@/infrastructure/rabbitmq/rabbitmq.module';
import { S3Module } from '@/infrastructure/s3/s3.module';
import { PrismaModule } from '@/infrastructure/prisma/prisma.module';

@Module({
  imports: [RabbitMQModule, S3Module, PrismaModule],
  controllers: [SummarizerController],
  providers: [SummarizerService],
})
export class SummarizerModule {}