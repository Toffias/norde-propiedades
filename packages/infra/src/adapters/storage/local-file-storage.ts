import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

import type { FileStorage, StoredObject } from '@norde/core/settings';
import { z } from 'zod';

// Las claves las genera el sistema (`company-files/<uuid>`): segmentos simples, sin `..` ni rutas
// absolutas. Cualquier otra cosa es un bug o un intento de salir de la carpeta.
const KEY = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

const MetadataSchema = z.object({ contentType: z.string() });

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Storage en disco para desarrollo y tests. Guarda el tipo de contenido en un `.json` al lado. */
export class LocalFileStorage implements FileStorage {
  readonly #root: string;

  constructor(directory: string) {
    this.#root = resolve(directory);
  }

  async put(object: StoredObject): Promise<void> {
    const path = this.pathOf(object.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, object.bytes);
    await writeFile(`${path}.json`, JSON.stringify({ contentType: object.contentType }));
  }

  async get(key: string): Promise<StoredObject | undefined> {
    const path = this.pathOf(key);
    try {
      const [bytes, metadata] = await Promise.all([
        readFile(path),
        readFile(`${path}.json`, 'utf8'),
      ]);
      const { contentType } = MetadataSchema.parse(JSON.parse(metadata));
      return { key, contentType, bytes: new Uint8Array(bytes) };
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.pathOf(key);
    await rm(path, { force: true });
    await rm(`${path}.json`, { force: true });
  }

  /** En disco no hay URLs firmadas: el panel sirve el contenido después de autorizarlo. */
  signedUrl(): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }

  private pathOf(key: string): string {
    if (!KEY.test(key)) throw new Error(`Invalid storage key: ${key}`);
    const path = join(this.#root, ...key.split('/'));
    if (!path.startsWith(this.#root + sep)) throw new Error(`Invalid storage key: ${key}`);
    return path;
  }
}
