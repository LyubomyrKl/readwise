import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { validate } from './config/env.validation';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { BooksModule } from './modules/books/books.module';
import { SummarizerModule } from './modules/summarizer/summarizer.module';
import { HighlightsModule } from './modules/highlights/highlights.module';
import { NotesModule } from './modules/notes/notes.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { S3Module } from './infrastructure/s3/s3.module';
import { RabbitMQModule } from './infrastructure/rabbitmq/rabbitmq.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    PrismaModule,
    S3Module,
    RabbitMQModule,
    UsersModule,
    AuthModule,
    BooksModule,
    SummarizerModule,
    HighlightsModule,
    NotesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
