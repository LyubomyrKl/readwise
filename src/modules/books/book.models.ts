import { ApiProperty } from '@nestjs/swagger';
import { BookStatus } from '@prisma/client';

export class UploadInfo {
  @ApiProperty()
  url!: string;

  @ApiProperty()
  headers!: Record<string, string>;
}

export class PresignResponse {
  @ApiProperty()
  bookId!: string;

  @ApiProperty()
  storageKey!: string;

  @ApiProperty({ type: UploadInfo })
  upload!: UploadInfo;
}

export class FinalizeResponse {
  @ApiProperty()
  bookId!: string;

  @ApiProperty()
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
  cover?: string;

  @ApiProperty()
  spentHours!: number;

  @ApiProperty({ required: false })
  pageCount?: number;

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
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export interface DownloadHeaders {
  'Content-Type': string;
  'Accept-Ranges': string;
  'Content-Disposition': string;
  'Content-Length': string;
  'Content-Range'?: string;
  Location: string;
}

export class DownloadResponse {
  @ApiProperty()
  headers!: DownloadHeaders;

  @ApiProperty()
  statusCode!: number;
}
