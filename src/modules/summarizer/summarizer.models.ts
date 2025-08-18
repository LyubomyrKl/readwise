import { ApiProperty } from '@nestjs/swagger';

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
}