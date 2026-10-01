import { sql } from 'drizzle-orm';
import { boolean, customType, text, timestamp } from 'drizzle-orm/pg-core';

/** `created_at` / `updated_at`. Los setea la app con `Clock`, sin defaults de la base. */
export function timestamps() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  };
}

/**
 * Autoría: ID del usuario o actor de sistema (`system:agent-ia`). El historial completo está en
 * `audit_log`; esto es lo que muestran las grillas.
 */
export function authorship() {
  return {
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
  };
}

/** Autoría de las tablas de vínculo, que se insertan y se borran pero nunca se editan. */
export function linkAuthorship() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    createdBy: text('created_by').notNull(),
  };
}

/** Papelera: baja lógica. Los índices de listados son parciales `where deleted_at is null`. */
export function trash() {
  return {
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: text('deleted_by'),
  };
}

export const notDeleted = sql`deleted_at is null`;

/**
 * Para índices únicos sobre una columna nullable (raíz de un árbol, etiqueta sin grupo): `null`
 * no choca con `null` en un índice, así que se compara contra este valor.
 */
export const NIL_UUID = sql`'00000000-0000-0000-0000-000000000000'::uuid`;

/**
 * PK de las tablas de configuración de fila única: siempre `true`, con un `check (id)`. La
 * migración inserta la fila con los valores por defecto.
 */
export function singletonId() {
  return { id: boolean('id').primaryKey().default(true) };
}

/**
 * Texto de búsqueda en minúsculas y sin acentos, generado por la base a partir de las columnas
 * dadas. `core.search_normalize` la crea la migración `0001` (envuelve `unaccent`, que no es
 * `IMMUTABLE`). Se indexa con GIN trigram.
 *
 * Recibe nombres de columnas `text` de la misma tabla. Se concatenan con `||` y no con
 * `concat_ws`, que no es `IMMUTABLE` y la base no lo acepta en una columna generada.
 */
export function searchText(...columns: readonly [string, ...string[]]) {
  const joined = columns.map((column) => `coalesce("${column}", '')`).join(` || ' ' || `);
  return text('search_text').generatedAlwaysAs(sql.raw(`core.search_normalize(${joined})`));
}

/** `bytea` como `Buffer` (drizzle no trae el tipo). */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});
