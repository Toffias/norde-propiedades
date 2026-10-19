import 'server-only';

// Composition root: único archivo de la app que importa @norde/infra.
// Arma los casos de uso de @norde/core (propiedades, emprendimientos, contactos) que usa el sitio.
// El contenido editorial NO pasa por acá: se lee con la Local API de Payload.

import {
  GetPropertyDetail,
  GetPublicPhoto,
  GetPublishedDevelopment,
  SearchProperties,
  SearchPublishedDevelopments,
} from '@norde/core/properties';
import { Actor } from '@norde/core/shared';
import {
  createDatabase,
  DrizzlePropertySearchQuery,
  DrizzlePublishedDevelopmentQuery,
  LocalFileStorage,
  S3FileStorage,
  WebChatClient,
  WebInquiryClient,
  type WebChatMessage,
  type WebChatOutcome,
  type DatabaseConnection,
  type WebInquiry,
  type WebInquiryOutcome,
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

/** Emprendimientos que se comercializan, ya con el actor de la web. */
export interface DevelopmentsUseCases {
  search(
    input: Parameters<SearchPublishedDevelopments['execute']>[0],
  ): ReturnType<SearchPublishedDevelopments['execute']>;
  detail(
    input: Parameters<GetPublishedDevelopment['execute']>[0],
  ): ReturnType<GetPublishedDevelopment['execute']>;
}

/** Las consultas del formulario, que se mandan a apps/gestion. `undefined` si no está configurado. */
export interface InquirySender {
  send(inquiry: WebInquiry): Promise<WebInquiryOutcome>;
}

// Tipos de la respuesta del agente que usa la Server Action del chat.
export type { WebChatListingSearch, WebChatReply } from '@norde/infra';

/** El chat del sitio, que habla con apps/agent (ADR 0037). `undefined` si no está configurado. */
export interface ChatSender {
  send(message: WebChatMessage): Promise<WebChatOutcome>;
}

export interface Container {
  readonly database: DatabaseConnection;
  readonly properties: PropertiesUseCases;
  readonly developments: DevelopmentsUseCases;
  readonly inquiries: InquirySender | undefined;
  readonly chat: ChatSender | undefined;
}

function createStorage(env: Env) {
  if (env.STORAGE_DRIVER !== 's3') return new LocalFileStorage(env.STORAGE_LOCAL_DIR);
  // `getEnv` ya exigió estas variables con STORAGE_DRIVER=s3.
  return new S3FileStorage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION ?? 'auto',
    bucket: env.S3_BUCKET ?? '',
    prefix: env.S3_PREFIX,
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
  const developments = new DrizzlePublishedDevelopmentQuery(database.db);
  const photo = new GetPublicPhoto({ properties, developments, storage: createStorage(env) });
  const searchDevelopments = new SearchPublishedDevelopments({ developments });
  const developmentDetail = new GetPublishedDevelopment({ developments });
  return {
    database,
    properties: {
      search: (input) => search.execute(input, WEB_ACTOR),
      detail: (input) => detail.execute(input, WEB_ACTOR),
      photo: (input) => photo.execute(input, WEB_ACTOR),
    },
    developments: {
      search: (input) => searchDevelopments.execute(input, WEB_ACTOR),
      detail: (input) => developmentDetail.execute(input, WEB_ACTOR),
    },
    inquiries:
      env.INQUIRY_WEBHOOK_URL && env.INQUIRY_WEBHOOK_SECRET
        ? new WebInquiryClient({ url: env.INQUIRY_WEBHOOK_URL, secret: env.INQUIRY_WEBHOOK_SECRET })
        : undefined,
    chat:
      env.AGENT_CHAT_URL && env.AGENT_CHAT_SECRET
        ? new WebChatClient({ url: env.AGENT_CHAT_URL, secret: env.AGENT_CHAT_SECRET })
        : undefined,
  };
}

let container: Container | undefined;

/** Se crea al primer uso y se reutiliza durante toda la vida del proceso. */
export function getContainer(): Container {
  container ??= createContainer();
  return container;
}
