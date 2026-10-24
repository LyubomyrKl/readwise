import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from '@/infrastructure/prisma/prisma.module';
import { S3Module } from '@/infrastructure/s3/s3.module';
import { RabbitMQModule } from '@/infrastructure/rabbitmq/rabbitmq.module';

@Module({
  imports: [PrismaModule, S3Module, RabbitMQModule],
  controllers: [HealthController],
})
export class HealthModule {}
