import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { S3FileStorage } from './s3-file-storage';

interface ReceivedRequest {
  readonly method: string;
  readonly path: string;
}

let server: Server;
let endpoint: string;
let received: ReceivedRequest[];

/** Un S3 mínimo en memoria: con un endpoint por IP, el SDK usa rutas `/<bucket>/<key>`. */
const objects = new Map<string, { readonly contentType: string; readonly bytes: Buffer }>();

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

beforeAll(async () => {
  server = createServer((request, response) => {
    void (async () => {
      const path = decodeURIComponent(new URL(request.url ?? '/', 'http://s3').pathname);
      const method = request.method ?? 'GET';
      received.push({ method, path });
      if (method === 'PUT') {
        objects.set(path, {
          contentType: request.headers['content-type'] ?? 'application/octet-stream',
          bytes: await readBody(request),
        });
        response.writeHead(200).end();
        return;
      }
      if (method === 'DELETE') {
        objects.delete(path);
        response.writeHead(204).end();
        return;
      }
      const object = objects.get(path);
      if (!object) {
        response
          .writeHead(404, { 'content-type': 'application/xml' })
          .end('<Error><Code>NoSuchKey</Code><Message>missing</Message></Error>');
        return;
      }
      response.writeHead(200, { 'content-type': object.contentType }).end(object.bytes);
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  // `address()` devuelve un objeto cuando el server escucha en un puerto TCP.
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
});

beforeEach(() => {
  received = [];
  objects.clear();
});

function storage(prefix?: string): S3FileStorage {
  return new S3FileStorage({
    endpoint,
    region: 'us-east-2',
    bucket: 'norde-test',
    prefix,
    accessKeyId: 'test',
    secretAccessKey: 'test',
  });
}

const KEY = 'properties/0192/media/0193/original';

describe('S3FileStorage', () => {
  it('keeps the keys at the root of the bucket without a prefix', async () => {
    await storage().put({ key: KEY, contentType: 'image/jpeg', bytes: new Uint8Array([1]) });

    expect(received).toEqual([{ method: 'PUT', path: `/norde-test/${KEY}` }]);
  });

  it('stores, reads and deletes inside the prefix folder, and returns the key without it', async () => {
    const files = storage('norde-uat');

    await files.put({ key: KEY, contentType: 'image/jpeg', bytes: new Uint8Array([1, 2]) });
    const read = await files.get(KEY);
    await files.delete(KEY);

    expect(read).toEqual({ key: KEY, contentType: 'image/jpeg', bytes: new Uint8Array([1, 2]) });
    expect(received.map((request) => request.path)).toEqual([
      `/norde-test/norde-uat/${KEY}`,
      `/norde-test/norde-uat/${KEY}`,
      `/norde-test/norde-uat/${KEY}`,
    ]);
    expect(objects.size).toBe(0);
  });

  it('ignores the slashes around the prefix', async () => {
    await storage('/norde-uat/').put({
      key: KEY,
      contentType: 'image/jpeg',
      bytes: new Uint8Array([1]),
    });

    expect(received[0]?.path).toBe(`/norde-test/norde-uat/${KEY}`);
  });

  it('returns nothing for a missing object', async () => {
    expect(await storage('norde-uat').get(KEY)).toBeUndefined();
  });

  it('signs the URL of the object inside the prefix', async () => {
    const url = await storage('norde-uat').signedUrl(KEY, { expiresInSeconds: 300 });

    expect(new URL(url ?? '').pathname).toBe(`/norde-test/norde-uat/${KEY}`);
  });
});
