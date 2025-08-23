import { ApiProperty } from '@nestjs/swagger';
import { BookResponse } from '@/modules/books/book.models';

export class SummaryRequestResponse {
  @ApiProperty({
    description: 'Whether the request was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Summary request queued successfully',
  })
  message: string;

  @ApiProperty({
    description: 'User ID who requested the summary',
    example: 'user-uuid-here',
  })
  userId: string;

  @ApiProperty({
    description: 'Book ID that was queued for summarization',
    example: 'book-uuid-here',
  })
  bookId: string;

  @ApiProperty({
    description: 'S3 key of existing summary (if summary already exists)',
    example: 'summaries/user-123/book-456/summary.json',
    required: false,
  })
  summaryKey?: string;
}

export class SummaryResponse extends BookResponse{
  @ApiProperty({
    description: 'The summary content as JSON object',
    example: {
      title: 'Book Title',
      summary: 'This is the summary text...',
      keyPoints: ['Point 1', 'Point 2'],
      chapters: [
        { title: 'Chapter 1', summary: 'Chapter 1 summary' }
      ]
    },
  })
  summary: Record<string, any>;
}