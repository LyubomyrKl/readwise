import { ApiProperty } from '@nestjs/swagger';
import type { BookStatus, BookTag, Note, Highlight } from '@prisma/client';
import { IsNotEmpty, IsString } from 'class-validator';

export class PresignInfo {
  @ApiProperty({ description: 'Presigned upload URL' })
  url!: string;

  @ApiProperty({ description: 'Required headers for upload' })
  headers!: Record<string, string>;
}

export class PresignResponse {
  @ApiProperty({ description: 'Created book ID' })
  bookId!: string;

  @ApiProperty({ description: 'Storage key for book file' })
  storageKey!: string;

  @ApiProperty({
    description: 'Presigned upload info for book file',
    type: PresignInfo,
  })
  presignUploadInfo!: PresignInfo;

  @ApiProperty({
    description: 'Storage key for custom cover file',
    required: false,
  })
  customCoverStorageKey?: string;

  @ApiProperty({
    description: 'Presigned upload info for custom cover',
    type: PresignInfo,
    required: false,
  })
  customCoverPresignInfo?: PresignInfo;
}

export class FinalizeResponse {
  @ApiProperty({ description: 'Book ID' })
  bookId!: string;

  @ApiProperty({
    description: 'Book status after finalization',
    enum: ['ready'],
  })
  status!: BookStatus;
}

export class BookResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  author!: string;

  @ApiProperty({ required: false })
  coverUrl?: string;

  @ApiProperty({ required: true })
  fileUrl!: string;

  @ApiProperty()
  spentHours!: number;

  @ApiProperty({ required: false })
  pageCount?: number | null;

  @ApiProperty()
  pagePassCount!: number;

  @ApiProperty()
  isFinished!: boolean;

  @ApiProperty()
  isFavorite!: boolean;

  @ApiProperty()
  mime!: string;

  @ApiProperty()
  sizeBytes!: string; // BigInt converted to string

  @ApiProperty()
  status!: string;

  @ApiProperty()
  notes!: Note[];

  @ApiProperty()
  highlights!: Highlight[];

  @ApiProperty()
  tags!: BookTag[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class DownloadResponse {
  @ApiProperty()
  headers!: DownloadHeaders;

  @ApiProperty()
  statusCode!: number;
}

export class CoverPresignResponse {
  @ApiProperty({
    description: 'Presigned upload info for cover',
    type: PresignInfo,
  })
  presignUploadInfo!: PresignInfo;

  @ApiProperty({ description: 'Storage key for cover file' })
  storageKey!: string;
}

export class DownloadHeadersDto {
  @ApiProperty({ description: 'Content-Type of the file' })
  'Content-Type': string;

  @ApiProperty({ description: 'Accept-Ranges header' })
  'Accept-Ranges': string;

  @ApiProperty({ description: 'Content-Disposition header' })
  'Content-Disposition': string;

  @ApiProperty({ description: 'Content-Length of the file' })
  'Content-Length': string;

  @ApiProperty({ description: 'Content-Range header', required: false })
  'Content-Range'?: string;

  @ApiProperty({ description: 'Location header for redirection' })
  Location: string;
}

export class CoverUpdateDto {
  @ApiProperty({
    description: 'Book ID to update cover for',
    example: 'uuid-here',
  })
  @IsString()
  @IsNotEmpty()
  bookId!: string;

  @ApiProperty({ description: 'Cover filename', example: 'cover.jpg' })
  @IsString()
  @IsNotEmpty()
  storageKey!: string;
}

export interface DownloadHeaders {
  'Content-Type': string;
  'Accept-Ranges': string;
  'Content-Disposition': string;
  'Content-Length': string;
  'Content-Range'?: string;
  Location: string;
}
