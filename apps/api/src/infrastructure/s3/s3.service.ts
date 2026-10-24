import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { EnvironmentVariables } from '@/config/env.validation';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly coverBucketName: string;
  private readonly summariesBucketName: string;

  constructor(private readonly config: ConfigService<EnvironmentVariables>) {
    const host = this.config.get('S3_HOST', { infer: true })!;
    const region = this.config.get('S3_REGION', { infer: true })!;
    const accessKeyId = this.config.get('S3_ACCESS_KEY_ID', { infer: true })!;
    const secretAccessKey = this.config.get('S3_SECRET_ACCESS_KEY', { infer: true })!;

    this.bucketName = this.config.get('S3_BOOK_BUCKET_NAME', { infer: true })!;
    this.coverBucketName = this.config.get('S3_BOOK_COVER_BUCKET_NAME', { infer: true })!;
    this.summariesBucketName = this.config.get('S3_SUMMARIES_BUCKET_NAME', { infer: true })!;

    const credentials = { accessKeyId, secretAccessKey };

    this.client = new S3Client({
      endpoint: `http://${host}:9000`,
      region,
      credentials,
      forcePathStyle: true,
    });
  }

  async uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    });
    await this.client.send(command);
  }

  async uploadCoverObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.coverBucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    });
    await this.client.send(command);
  }

  async getBookStream(key: string): Promise<{ stream: ReadableStream; contentType?: string; contentLength?: number }> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    const response = await this.client.send(command);
    return {
      stream: response.Body!.transformToWebStream(),
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  }

  async getCoverStream(key: string): Promise<{ stream: ReadableStream; contentType?: string; contentLength?: number }> {
    const command = new GetObjectCommand({
      Bucket: this.coverBucketName,
      Key: key,
    });
    const response = await this.client.send(command);
    return {
      stream: response.Body!.transformToWebStream(),
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  }

  generateStorageKey(userId: string, filename: string, mimeType?: string): string {
    const filenameWithExt = this.ensureExtension(filename, mimeType);
    return `${userId}-${Date.now()}-${filenameWithExt}`;
  }

  generateCoverStorageKey(userId: string, filename: string, mimeType?: string): string {
    const filenameWithExt = this.ensureExtension(filename, mimeType);
    return `${userId}-${Date.now()}-${filenameWithExt}`;
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    await this.client.send(command);
  }

  async deleteCoverObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.coverBucketName,
      Key: key,
    });
    await this.client.send(command);
  }

  async deleteSummaryObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.summariesBucketName,
      Key: key,
    });
    await this.client.send(command);
  }

  async getJsonObject(key: string): Promise<Record<string, unknown>> {
    const command = new GetObjectCommand({
      Bucket: this.summariesBucketName,
      Key: key,
    });

    const response = await this.client.send(command);
    const chunks: Buffer[] = [];

    if (response.Body) {
      const reader = response.Body.transformToWebStream().getReader();
      let result = await reader.read();
      while (!result.done) {
        chunks.push(Buffer.from(result.value));
        result = await reader.read();
      }
    }

    const buffer = Buffer.concat(chunks);
    const jsonString = buffer.toString('utf-8');

    try {
      return JSON.parse(jsonString) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`Failed to parse JSON from S3 object: ${error instanceof Error ? error.message : 'Invalid JSON'}`);
    }
  }

  private ensureExtension(filename: string, mimeType?: string): string {
    if (filename.includes('.')) {
      return filename;
    }
    if (mimeType) {
      const extension = this.getExtensionFromMimeType(mimeType);
      return filename + extension;
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
