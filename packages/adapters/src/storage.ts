// S3-compatible storage adapter (ParsPack free tier per 012; portable
// to Liara/Arvan/any S3 via endpoint+credentials — config, not rewrite).
// Immutable object keys: new upload = new key, never overwrite (012).

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

export interface StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** optional prefix for prod/staging separation (012) */
  prefix?: string;
  /** public base URL for generated object URLs */
  publicBaseUrl: string;
}

export function storageConfigFromEnv(): StorageConfig | null {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !bucket) return null;
  return {
    endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    bucket,
    prefix: process.env.S3_PREFIX,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? endpoint,
  };
}

export interface UploadInput {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}

export interface Storage {
  upload(input: UploadInput): Promise<string>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

class S3Storage implements Storage {
  private client: S3Client;
  constructor(private cfg: StorageConfig) {
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      forcePathStyle: true,
    });
  }

  private fullKey(key: string): string {
    return this.cfg.prefix ? `${this.cfg.prefix}/${key}` : key;
  }

  async upload(input: UploadInput): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: this.fullKey(input.key),
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
    return this.getUrl(input.key);
  }

  getUrl(key: string): string {
    const base = this.cfg.publicBaseUrl.replace(/\/$/, "");
    const prefix = this.cfg.prefix ? `${this.cfg.prefix}/` : "";
    return `${base}/${prefix}${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: this.fullKey(key) }),
    );
  }

  async list(prefix: string): Promise<string[]> {
    const out: string[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({
        Bucket: this.cfg.bucket,
        Prefix: this.fullKey(prefix),
        ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
      }));
      out.push(...(page.Contents ?? []).map((o) => o.Key ?? ""));
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return out;
  }
}

export function createStorage(cfg: StorageConfig): Storage {
  return new S3Storage(cfg);
}
