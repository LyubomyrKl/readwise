import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { EnvironmentVariables } from '@platform/config/env.validation';

/** Logical bucket names; the physical names come from the environment. */
export type BucketName =
  | 'books'
  | 'covers'
  | 'extractions'
  | 'summaries'
  | 'checkpoints';

export interface ObjectStream {
  stream: ReadableStream;
  contentType?: string;
  contentLength?: number;
}

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly buckets: Record<BucketName, string>;

  constructor(private readonly config: ConfigService<EnvironmentVariables>) {
    const host = this.config.get('S3_HOST', { infer: true })!;
    const port = this.config.get('S3_PORT', { infer: true }) ?? '9000';
    const endpoint =
      this.config.get('S3_ENDPOINT', { infer: true }) || `http://${host}:${port}`;
    const region = this.config.get('S3_REGION', { infer: true })!;
    const accessKeyId = this.config.get('S3_ACCESS_KEY_ID', { infer: true })!;
    const secretAccessKey = this.config.get('S3_SECRET_ACCESS_KEY', { infer: true })!;

    this.buckets = {
      books: this.config.get('S3_BOOK_BUCKET_NAME', { infer: true })!,
      covers: this.config.get('S3_BOOK_COVER_BUCKET_NAME', { infer: true })!,
      extractions: this.config.get('S3_EXTRACTIONS_BUCKET_NAME', { infer: true }) ?? 'extractions',
      summaries: this.config.get('S3_SUMMARIES_BUCKET_NAME', { infer: true })!,
      checkpoints: this.config.get('S3_CHECKPOINTS_BUCKET_NAME', { infer: true }) ?? 'checkpoints',
    };

    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }

  /** Physical name of a logical bucket. */
  bucket(name: BucketName): string {
    return this.buckets[name];
  }

  async putObject(
    bucket: BucketName,
    key: string,
    body: Buffer | string,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket(bucket),
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async getObjectStream(bucket: BucketName, key: string): Promise<ObjectStream> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket(bucket), Key: key }),
    );
    return {
      stream: response.Body!.transformToWebStream(),
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  }

  async getJson<T = Record<string, unknown>>(bucket: BucketName, key: string): Promise<T> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket(bucket), Key: key }),
    );
    const text = (await response.Body?.transformToString('utf-8')) ?? '';
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new Error(
        `Failed to parse JSON from s3://${this.bucket(bucket)}/${key}: ${
          error instanceof Error ? error.message : 'Invalid JSON'
        }`,
      );
    }
  }

  async deleteObject(bucket: BucketName, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket(bucket), Key: key }),
    );
  }

  async deleteObjects(bucket: BucketName, keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket(bucket),
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  async listKeys(bucket: BucketName, prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket(bucket),
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const item of page.Contents ?? []) {
        if (item.Key) keys.push(item.Key);
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return keys;
  }

  /** Readiness check: the books bucket must exist and be reachable. */
  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket('books') }));
  }

  generateStorageKey(userId: string, filename: string, mimeType?: string): string {
    return `${userId}-${Date.now()}-${this.ensureExtension(filename, mimeType)}`;
  }

  private ensureExtension(filename: string, mimeType?: string): string {
    if (filename.includes('.')) {
      return filename;
    }
    if (mimeType) {
      return filename + this.getExtensionFromMimeType(mimeType);
    }
    return filename;
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExtension: Record<string, string> = {
      'application/epub+zip': '.epub',
      'application/pdf': '.pdf',
      'application/x-mobipocket-ebook': '.mobi',
      'application/vnd.amazon.ebook': '.azw',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };
    return mimeToExtension[mimeType] || '';
  }
}
