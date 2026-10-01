import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalFileStorage } from './local-file-storage';

let directory: string;
let storage: LocalFileStorage;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'norde-storage-'));
  storage = new LocalFileStorage(directory);
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('LocalFileStorage', () => {
  it('stores, reads and deletes an object with its content type', async () => {
    const key = 'company-files/01920000-0000-7000-8000-000000000001';
    await storage.put({ key, contentType: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) });

    expect(await storage.get(key)).toEqual({
      key,
      contentType: 'application/pdf',
      bytes: new Uint8Array([1, 2, 3]),
    });

    await storage.delete(key);
    expect(await storage.get(key)).toBeUndefined();
  });

  it('returns nothing for a missing key and deletes it without failing', async () => {
    expect(await storage.get('settings/logo/missing')).toBeUndefined();
    await expect(storage.delete('settings/logo/missing')).resolves.toBeUndefined();
  });

  it.each(['../etc/passwd', '/absolute', 'a/../../b', 'Mayusculas', 'a//b', 'a\\b'])(
    'rejects the key %j',
    async (key) => {
      await expect(
        storage.put({ key, contentType: 'text/plain', bytes: new Uint8Array([1]) }),
      ).rejects.toThrow('Invalid storage key');
    },
  );
});
