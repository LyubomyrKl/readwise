import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RequestSummaryDto {
  @ApiProperty({
    description: 'ID of the book to summarize',
    example: 'book-uuid-here',
  })
  @IsString()
  @IsNotEmpty()
  bookId: string;
}