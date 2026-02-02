import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { EnvironmentVariables } from '@/config/env.validation';

@Injectable()
export class S3Service {
  // Internal client for backend operations (copy, delete, check exists)
  private readonly client: S3Client;
  // Public client for generating presigned URLs accessible by frontend
  private readonly publicClient: S3Client;
  private readonly bucketName: string;
  private readonly coverBucketName: string;
  private readonly summariesBucketName: string;

  constructor(private readonly config: ConfigService<EnvironmentVariables>) {
    const host = this.config.get('S3_HOST', { infer: true })!;
    const publicHost = this.config.get('S3_PUBLIC_HOST', { infer: true })!;
    const region = this.config.get('S3_REGION', { infer: true })!;
    const accessKeyId = this.config.get('S3_ACCESS_KEY_ID', { infer: true })!;
    const secretAccessKey = this.config.get('S3_SECRET_ACCESS_KEY', {
      infer: true,
    })!;
    this.bucketName = this.config.get('S3_BOOK_BUCKET_NAME', { infer: true })!;
    this.coverBucketName = this.config.get('S3_BOOK_COVER_BUCKET_NAME', {
      infer: true,
    })!;
    this.summariesBucketName = this.config.get('S3_SUMMARIES_BUCKET_NAME', {
      infer: true,
    })!;

    const credentials = { accessKeyId, secretAccessKey };

    // Internal client - uses Docker service name
    this.client = new S3Client({
      endpoint: `http://${host}:9000`,
      region,
      credentials,
      forcePathStyle: true,
    });

    // Public client - uses publicly accessible hostname for presigned URLs
    this.publicClient = new S3Client({
      endpoint: `http://${publicHost}:9000`,
      region,
      credentials,
      forcePathStyle: true,
    });
  }

  async generatePresignedUploadUrl(
    key: string,
    contentType: string,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    // Use publicClient so URL is accessible by frontend
    const url = await getSignedUrl(this.publicClient, command, {
      expiresIn: 3600,
    });

    return {
      url,
      headers: {
        'Content-Type': contentType,
      },
    };
  }

  async generatePresignedDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return await getSignedUrl(this.publicClient, command, {
      expiresIn: 3600,
    });
  }

  async isObjectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async getObjectBuffer(bucketName: string, key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await this.client.send(command);
    const chunks: Uint8Array[] = [];

    if (response.Body) {
      const reader = response.Body.transformToWebStream().getReader();
      let result = await reader.read();

      while (!result.done) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        chunks.push(result.value);
        result = await reader.read();
      }
    }

    return Buffer.concat(chunks);
  }

  async getBookBucketObjectBuffer(key: string): Promise<Buffer> {
    return this.getObjectBuffer(this.bucketName, key)
  }

  async copyObject(sourceKey: string, destKey: string): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: this.bucketName,
      CopySource: `${this.bucketName}/${encodeURIComponent(sourceKey)}`,
      Key: destKey,
    });

    await this.client.send(command);
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.client.send(command);
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
      'image/gif': '.gif'
    };
    return mimeToExtension[mimeType] || '';
  }

  private ensureExtension(filename: string, mimeType?: string): string {
    // If filename already has an extension, return as is
    if (filename.includes('.')) {
      return filename;
    }
    
    // If no extension and mime type provided, add appropriate extension
    if (mimeType) {
      const extension = this.getExtensionFromMimeType(mimeType);
      return filename + extension;
    }
    
    return filename;
  }

  generateStorageKey(userId: string, filename: string, mimeType?: string): string {
    const filenameWithExt = this.ensureExtension(filename, mimeType);
    return `${userId}-${Date.now()}-${filenameWithExt}`;
  }

  generateCoverStorageKey(userId: string, filename: string, mimeType?: string): string {
    const filenameWithExt = this.ensureExtension(filename, mimeType);
    return `${userId}-${Date.now()}-${filenameWithExt}`;
  }

  async generatePresignedCoverUploadUrl(
    key: string,
    contentType: string,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const command = new PutObjectCommand({
      Bucket: this.coverBucketName,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(this.publicClient, command, {
      expiresIn: 3600,
    });

    return {
      url,
      headers: {
        'Content-Type': contentType,
      },
    };
  }

  async generatePresignedCoverDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.coverBucketName,
      Key: key,
    });

    return await getSignedUrl(this.publicClient, command, {
      expiresIn: 3600,
    });
  }

  async isObjectCoverExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.coverBucketName,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async copyCoverObject(sourceKey: string, destKey: string): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: this.coverBucketName,
      CopySource: `${this.coverBucketName}/${encodeURIComponent(sourceKey)}`,
      Key: destKey,
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

  async getJsonObject(key: string): Promise<Record<string, any>> {
    const buffer = await this.getObjectBuffer(this.summariesBucketName, key)
    const jsonString = buffer.toString('utf-8');
    return JSON.parse(jsonString) as Record<string, any>;
  }
}
