import { Injectable } from '@nestjs/common';
import { RabbitMQService } from '@/infrastructure/rabbitmq/rabbitmq.service';
import { SummaryRequestResponse } from './summarizer.models';

@Injectable()
export class SummarizerService {
  constructor(private readonly rabbitMQService: RabbitMQService) {}

  async requestSummary(userId: string, bookId: string): Promise<SummaryRequestResponse> {
    const result = await this.rabbitMQService.publishSummaryRequest(userId, bookId);
    
    return {
      success: result.success,
      message: result.message,
      userId,
      bookId,
    };
  }
}