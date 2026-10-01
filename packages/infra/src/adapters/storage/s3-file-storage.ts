import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { FileStorage, StoredObject } from '@norde/core/settings';

export interface S3FileStorageOptions {
  /** Para Cloudflare R2: `https://<account>.r2.cloudflarestorage.com`. Sin valor, AWS S3. */
  readonly endpoint?: string | undefined;
  /** R2 usa `auto`. */
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** Tiempo máximo de cada operación. */
  readonly timeoutMs?: number;
}

/**
 * Storage S3 compatible (Cloudflare R2 o AWS S3). El bucket es privado: los archivos se sirven a
 * través del panel, que autoriza cada descarga.
 */
export class S3FileStorage implements FileStorage {
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #timeoutMs: number;

  constructor(options: S3FileStorageOptions) {
    this.#client = new S3Client({
      region: options.region,
      ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
    this.#bucket = options.bucket;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
  }

  async put(object: StoredObject): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: object.key,
        Body: object.bytes,
        ContentType: object.contentType,
      }),
      { abortSignal: AbortSignal.timeout(this.#timeoutMs) },
    );
  }

  async get(key: string): Promise<StoredObject | undefined> {
    try {
      const response = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(this.#timeoutMs) },
      );
      if (!response.Body) return undefined;
      return {
        key,
        contentType: response.ContentType ?? 'application/octet-stream',
        bytes: await response.Body.transformToByteArray(),
      };
    } catch (error) {
      // Que no exista es un resultado esperado; cualquier otro error sigue siendo inesperado.
      if (error instanceof NoSuchKey) return undefined;
      throw new Error(`Could not read ${key} from the storage`, { cause: error });
    }
  }

  async delete(key: string): Promise<void> {
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(this.#timeoutMs),
    });
  }
}
