export interface ParsedDatabaseUrl {
  readonly database: string;
  /** Misma conexión, pero a la base de mantenimiento `postgres` (para poder crear la base). */
  readonly maintenanceUrl: string;
  /** URL apta para logs: sin contraseña. */
  readonly redacted: string;
}

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

export function parseDatabaseUrl(raw: string): ParsedDatabaseUrl {
  const url = new URL(raw);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`DATABASE_URL debe usar el protocolo postgres:// (recibido ${url.protocol})`);
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!SAFE_IDENTIFIER.test(database)) {
    throw new Error(
      `Nombre de base inválido: "${database}". Usá solo letras, números y guión bajo.`,
    );
  }

  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';

  const redacted = new URL(url);
  if (redacted.password) redacted.password = '***';

  return { database, maintenanceUrl: maintenance.toString(), redacted: redacted.toString() };
}

/** Hosts de la máquina local. `URL.hostname` deja el IPv6 entre corchetes. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Si la URL apunta a una base de esta máquina. Mira también el parámetro `host` (con él, `pg` se
 * conecta a ese host e ignora el de la URL). Un socket Unix (`host=/var/run/...`) es local.
 */
export function isLocalDatabaseUrl(raw: string): boolean {
  const url = new URL(raw);
  if (!LOCAL_HOSTS.has(url.hostname.toLowerCase())) return false;
  const hostParam = url.searchParams.get('host');
  return (
    hostParam === null || hostParam.startsWith('/') || LOCAL_HOSTS.has(hostParam.toLowerCase())
  );
}
