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
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly coverBucketName: string;

  constructor(private readonly config: ConfigService<EnvironmentVariables>) {
    const endpoint = this.config.get('S3_ENDPOINT', { infer: true })!;
    const region = this.config.get('S3_REGION', { infer: true })!;
    const accessKeyId = this.config.get('S3_ACCESS_KEY_ID', { infer: true })!;
    const secretAccessKey = this.config.get('S3_SECRET_ACCESS_KEY', {
      infer: true,
    })!;

    this.bucketName = this.config.get('S3_BOOK_BUCKET_NAME', { infer: true })!;
    this.coverBucketName = this.config.get('S3_BOOK_COVER_BUCKET_NAME', {
      infer: true,
    })!;

    this.client = new S3Client({
      endpoint: this.config.get('S3_ENDPOINT', { infer: true })!,
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.config.get('S3_ACCESS_KEY_ID', { infer: true })!,
        secretAccessKey: this.config.get('S3_SECRET_ACCESS_KEY', {
          infer: true,
        })!,
      },
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

    console.log(this.config.get('S3_ENDPOINT', { infer: true }));
    console.log(this.config.get('S3_REGION', { infer: true }));
    console.log(this.config.get('S3_ACCESS_KEY_ID', { infer: true }));
    console.log(this.config.get('S3_SECRET_ACCESS_KEY', { infer: true }));
    console.log(`Generating presigned URL for key: ${key}`);
    // Generate presigned PUT URL
    const url = await getSignedUrl(this.client, command, {
      expiresIn: 3600, // 1 hour
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

    return await getSignedUrl(this.client, command, {
      expiresIn: 3600, // 1 hour
    });
  }

  async objectExists(key: string): Promise<boolean> {
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

  async getObjectMetadata(key: string) {
    const command = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return await this.client.send(command);
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.client.send(command);
    const chunks: Uint8Array[] = [];

    if (response.Body) {
      const reader = response.Body.transformToWebStream().getReader();
      let result = await reader.read();

      while (!result.done) {
        chunks.push(result.value);
        result = await reader.read();
      }
    }

    return Buffer.concat(chunks);
  }

  async copyObject(sourceKey: string, destKey: string): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: this.bucketName,
      CopySource: `${this.bucketName}/${sourceKey}`,
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

  generateStorageKey(userId: string, filename: string): string {
    return `${userId}-${Date.now()}-${filename}`;
  }

  generateCoverStorageKey(userId: string, filename: string): string {
    return `${userId}-${Date.now()}-${filename}`;
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

    const url = await getSignedUrl(this.client, command, {
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

    return await getSignedUrl(this.client, command, {
      expiresIn: 3600, // 1 hour
    });
  }

  async coverObjectExists(key: string): Promise<boolean> {
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
      CopySource: `${this.coverBucketName}/${sourceKey}`,
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
}
