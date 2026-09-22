import 'server-only';

// Composition root: único archivo de la app que importa @norde/infra.
// Arma los casos de uso de @norde/core (propiedades, promociones, contactos) que usa el sitio.
// El contenido editorial NO pasa por acá: se lee con la Local API de Payload.

import { createDatabase, type DatabaseConnection } from '@norde/infra';

import { getEnv } from './config/env';

export interface Container {
  readonly database: DatabaseConnection;
}

let container: Container | undefined;

/** Se crea al primer uso y se reutiliza durante toda la vida del proceso. */
export function getContainer(): Container {
  container ??= {
    database: createDatabase({ url: getEnv().DATABASE_URL, applicationName: 'norde-web' }),
  };
  return container;
}
