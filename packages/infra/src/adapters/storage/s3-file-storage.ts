import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { FileStorage, PutOptions, SignedUrlOptions, StoredObject } from '@norde/core/settings';

export interface S3FileStorageOptions {
  /** Para Cloudflare R2: `https://<account>.r2.cloudflarestorage.com`. Sin valor, AWS S3. */
  readonly endpoint?: string | undefined;
  /** R2 usa `auto`. */
  readonly region: string;
  readonly bucket: string;
  /**
   * Carpeta del bucket donde viven los archivos, para compartirlo con otros proyectos
   * (`norde-uat`). Las claves que ve el sistema no la llevan. Sin valor, la raíz del bucket.
   */
  readonly prefix?: string | undefined;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** Tiempo máximo de cada operación. */
  readonly timeoutMs?: number;
  /** El reloj de las firmas reusables (en los tests). */
  readonly now?: () => Date;
}

/** Un objeto que no cambia nunca: el navegador lo cachea un año sin volver a pedirlo. */
const IMMUTABLE_CACHE_CONTROL = 'private, max-age=31536000, immutable';

/** `Content-Disposition` con el nombre original, también con acentos (RFC 6266). */
function attachment(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * Storage S3 compatible (Cloudflare R2 o AWS S3). El bucket es privado: el panel autoriza cada
 * descarga y entrega una URL firmada de corta duración.
 */
export class S3FileStorage implements FileStorage {
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #prefix: string;
  readonly #timeoutMs: number;
  readonly #now: () => Date;

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
    const folder = (options.prefix ?? '').replace(/^\/+|\/+$/g, '');
    this.#prefix = folder === '' ? '' : `${folder}/`;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#now = options.now ?? (() => new Date());
  }

  async put(object: StoredObject, options?: PutOptions): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: this.#objectKey(object.key),
        Body: object.bytes,
        ContentType: object.contentType,
        ...(options?.immutable === true ? { CacheControl: IMMUTABLE_CACHE_CONTROL } : {}),
      }),
      { abortSignal: AbortSignal.timeout(this.#timeoutMs) },
    );
  }

  async get(key: string): Promise<StoredObject | undefined> {
    try {
      const response = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: this.#objectKey(key) }),
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

  /** Firma localmente (sin llamar al bucket): no puede fallar por red. */
  signedUrl(key: string, options: SignedUrlOptions): Promise<string | undefined> {
    return getSignedUrl(
      this.#client,
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: this.#objectKey(key),
        ...(options.downloadName === undefined
          ? {}
          : { ResponseContentDisposition: attachment(options.downloadName) }),
      }),
      {
        expiresIn: options.expiresInSeconds,
        ...(options.reusable === true
          ? { signingDate: this.#signingWindow(options.expiresInSeconds) }
          : {}),
      },
    );
  }

  /**
   * El comienzo de la ventana actual, de media vigencia: firmada con esa fecha, la URL es la misma
   * durante toda la ventana y sigue vigente al menos otra media vigencia.
   */
  #signingWindow(expiresInSeconds: number): Date {
    const windowMs = Math.max(1, Math.floor(expiresInSeconds / 2)) * 1000;
    const now = this.#now().getTime();
    return new Date(now - (now % windowMs));
  }

  async delete(key: string): Promise<void> {
    await this.#client.send(
      new DeleteObjectCommand({ Bucket: this.#bucket, Key: this.#objectKey(key) }),
      { abortSignal: AbortSignal.timeout(this.#timeoutMs) },
    );
  }

  #objectKey(key: string): string {
    return `${this.#prefix}${key}`;
  }
}
