import { Module } from '@nestjs/common';
import { BooksController } from './books.controller';
import { BooksService } from './books.service';
import { BookFilesService } from './book.files.service';

@Module({
  controllers: [BooksController],
  providers: [BooksService, BookFilesService],
})
export class BooksModule {}
