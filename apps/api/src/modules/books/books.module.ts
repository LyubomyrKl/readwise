import { Module } from '@nestjs/common';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { BookFilesService } from './book.files.service';
import { RabbitMQModule } from '@/infrastructure/rabbitmq/rabbitmq.module';

@Module({
  imports: [RabbitMQModule],
  controllers: [BooksController],
  providers: [BooksService, BookFilesService],
})
export class BooksModule {}
