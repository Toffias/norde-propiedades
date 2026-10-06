import 'server-only';

// Composition root: único archivo de la app que importa @norde/infra.
// Arma los casos de uso de @norde/core (propiedades, promociones, contactos) que usa el sitio.
// El contenido editorial NO pasa por acá: se lee con la Local API de Payload.

import { GetPropertyDetail, GetPublicPhoto, SearchProperties } from '@norde/core/properties';
import { Actor } from '@norde/core/shared';
import {
  createDatabase,
  DrizzlePropertySearchQuery,
  LocalFileStorage,
  S3FileStorage,
  type DatabaseConnection,
} from '@norde/infra';

import { getEnv, type Env } from './config/env';

/**
 * El sitio público lee como `system:web`: solo lo publicado, con las reglas del dominio
 * (ADR 0023). Los formularios suman sus permisos cuando lleguen (contacto, tasación).
 */
const WEB_ACTOR = Actor.system('web', ['properties:read']);

/** Casos de uso de propiedades, ya con el actor de la web. */
export interface PropertiesUseCases {
  search(
    input: Parameters<SearchProperties['execute']>[0],
  ): ReturnType<SearchProperties['execute']>;
  detail(
    input: Parameters<GetPropertyDetail['execute']>[0],
  ): ReturnType<GetPropertyDetail['execute']>;
  photo(input: Parameters<GetPublicPhoto['execute']>[0]): ReturnType<GetPublicPhoto['execute']>;
}

export interface Container {
  readonly database: DatabaseConnection;
  readonly properties: PropertiesUseCases;
}

function createStorage(env: Env) {
  if (env.STORAGE_DRIVER !== 's3') return new LocalFileStorage(env.STORAGE_LOCAL_DIR);
  // `getEnv` ya exigió estas variables con STORAGE_DRIVER=s3.
  return new S3FileStorage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION ?? 'auto',
    bucket: env.S3_BUCKET ?? '',
    accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
  });
}

function createContainer(): Container {
  const env = getEnv();
  const database = createDatabase({ url: env.DATABASE_URL, applicationName: 'norde-web' });
  const properties = new DrizzlePropertySearchQuery(database.db);
  const search = new SearchProperties({ properties });
  const detail = new GetPropertyDetail({ properties });
  const photo = new GetPublicPhoto({ properties, storage: createStorage(env) });
  return {
    database,
    properties: {
      search: (input) => search.execute(input, WEB_ACTOR),
      detail: (input) => detail.execute(input, WEB_ACTOR),
      photo: (input) => photo.execute(input, WEB_ACTOR),
    },
  };
}

let container: Container | undefined;

/** Se crea al primer uso y se reutiliza durante toda la vida del proceso. */
export function getContainer(): Container {
  container ??= createContainer();
  return container;
}
