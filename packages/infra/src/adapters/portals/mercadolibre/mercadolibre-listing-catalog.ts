import type {
  ListingOperation,
  ListingType,
  PortalId,
  PortalListingCatalog,
  PortalNotConfiguredError,
  PortalSyncError,
  PortalUnavailableError,
  RemoteDevelopment,
  RemoteListing,
} from '@norde/core/portals';
import { err, ok, type PageSlice, type Result } from '@norde/core/shared';
import { z } from 'zod';

import { operationOfCategory } from './mercadolibre-listing';
import {
  MercadoLibreReads,
  type MercadoLibreReadError,
  type MercadoLibreReadsOptions,
} from './mercadolibre-reads';

export type MercadoLibreListingCatalogOptions = MercadoLibreReadsOptions;

type CatalogError = PortalNotConfiguredError | PortalUnavailableError;

/** Lo que acepta el multiget de items (`/items?ids=`) por pedido. */
const MULTIGET_SIZE = 20;
/** Los estados de un aviso que todavía se puede tomar: Tokko pausa los de las reservadas. */
const LINKABLE_STATUSES: ReadonlySet<string> = new Set(['active', 'paused']);
const NO_DEVELOPMENTS =
  'MercadoLibre todavía no vincula emprendimientos: sus unidades se vinculan una por una, como propiedades.';

const SearchSchema = z.object({
  results: z.array(z.string()),
  paging: z.object({ total: z.number().int().nonnegative() }).loose(),
});

const ItemSchema = z
  .object({
    id: z.string(),
    title: z.string().nullish(),
    status: z.string(),
    seller_id: z.union([z.number(), z.string()]).transform(String).nullish(),
    category_id: z.string().nullish(),
    listing_type_id: z.string().nullish(),
    permalink: z.string().nullish(),
    seller_custom_field: z.string().nullish(),
    attributes: z
      .array(z.object({ id: z.string(), value_name: z.string().nullish() }).loose())
      .nullish(),
    location: z
      .object({
        neighborhood: z.object({ name: z.string().nullish() }).loose().nullish(),
        city: z.object({ name: z.string().nullish() }).loose().nullish(),
      })
      .loose()
      .nullish(),
  })
  .loose();
type Item = z.infer<typeof ItemSchema>;

const MultigetSchema = z.array(z.object({ code: z.number(), body: z.unknown() }));

/** El tipo de aviso de MercadoLibre en Norde: plata es simple, oro de cualquier tipo es destacado. */
function listingTypeOf(listingTypeId: string | null | undefined): ListingType | undefined {
  if (listingTypeId === 'silver') return 'simple';
  if (listingTypeId?.startsWith('gold') === true) return 'featured';
  return undefined;
}

/** La operación por el atributo `OPERATION` ("Venta", "Alquiler", "Alquiler temporario"). */
function operationOf(item: Item): ListingOperation | undefined {
  const value = item.attributes?.find((a) => a.id === 'OPERATION')?.value_name?.toLowerCase();
  if (value?.includes('temporal') === true || value?.includes('temporario') === true)
    return 'temporary_rent';
  if (value?.includes('alquiler') === true) return 'rent';
  if (value?.includes('venta') === true) return 'sale';
  return item.category_id ? operationOfCategory(item.category_id) : undefined;
}

/**
 * La clave con la que Tokko cargó la propiedad: el campo del vendedor o el SKU. Una unidad viene
 * con el código del emprendimiento adelante (`NBU70377 AP7794303`): queda el de la unidad.
 */
function referenceOf(item: Item): string | undefined {
  const sku = item.attributes?.find((a) => a.id === 'SELLER_SKU')?.value_name;
  const raw = (item.seller_custom_field ?? sku ?? '').trim();
  return raw === '' ? undefined : raw.split(/\s+/).at(-1);
}

function titleOf(item: Item): string {
  const title = item.title?.trim();
  return title === undefined || title === '' ? `Aviso ${item.id}` : title;
}

function toRemote(item: Item): RemoteListing {
  const location = [item.location?.neighborhood?.name, item.location?.city?.name]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(', ');
  return {
    remoteId: item.id,
    // El ID del aviso es el código con que lo maneja Norde (el `externalId` de la publicación).
    code: item.id,
    reference: referenceOf(item),
    title: titleOf(item),
    operation: operationOf(item),
    listingType: listingTypeOf(item.listing_type_id),
    plan: undefined,
    location: location === '' ? undefined : location,
    permalink: item.permalink ?? undefined,
    // Tokko publica las unidades sueltas: cada aviso es de una propiedad.
    isDevelopment: false,
  };
}

/**
 * Los avisos que la cuenta de MercadoLibre tiene online, para vincular los que publicó Tokko sin
 * republicarlos (ADR 0033). Lista los activos de la cuenta (`/users/{id}/items/search`) y lee cada
 * página con el multiget de items. Vincular no cambia nada en MercadoLibre: el aviso ya tiene su ID,
 * que pasa a ser el de la publicación.
 */
export class MercadoLibreListingCatalog implements PortalListingCatalog {
  readonly #api: MercadoLibreReads;

  constructor(options: MercadoLibreListingCatalogOptions) {
    this.#api = new MercadoLibreReads(options);
  }

  async online(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly offset: number;
    readonly limit: number;
    readonly remoteId?: string;
  }): Promise<Result<PageSlice<RemoteListing>, CatalogError>> {
    const { portal, externalAccountId } = input;
    if (input.remoteId !== undefined) {
      const items = await this.#items(portal, [input.remoteId]);
      if (items.isErr()) return err(items.error);
      // Solo un aviso de la cuenta, y que todavía se pueda tomar.
      const own = items.value.filter(
        (item) => item.seller_id === externalAccountId && LINKABLE_STATUSES.has(item.status),
      );
      return ok({ items: own.map(toRemote), total: own.length });
    }

    const path = `/users/${encodeURIComponent(externalAccountId)}/items/search`;
    const query = new URLSearchParams({
      status: 'active',
      offset: String(input.offset),
      limit: String(input.limit),
    });
    const read = await this.#api.get(portal, `${path}?${query.toString()}`);
    if (read.isErr()) return err(catalogError(read.error));
    const search = SearchSchema.safeParse(read.value);
    if (!search.success) {
      this.#api.unexpected(portal, path);
      return err({ type: 'PortalUnavailable' });
    }
    const items = await this.#items(portal, search.data.results);
    if (items.isErr()) return err(items.error);
    return ok({ items: items.value.map(toRemote), total: search.data.paging.total });
  }

  /** En MercadoLibre el aviso ya tiene su ID: vincular no le cambia nada. */
  link(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly remoteId: string;
    readonly listingId: string;
  }): Promise<
    Result<{ readonly externalId: string; readonly permalink: string | undefined }, PortalSyncError>
  > {
    return Promise.resolve(ok({ externalId: input.remoteId, permalink: undefined }));
  }

  onlineDevelopments(): Promise<Result<PageSlice<RemoteDevelopment>, CatalogError>> {
    return Promise.resolve(ok({ items: [], total: 0 }));
  }

  linkDevelopment(): Promise<
    Result<
      {
        readonly externalId: string;
        readonly permalink: string | undefined;
        readonly linkedUnits: number;
      },
      PortalSyncError
    >
  > {
    return Promise.resolve(err({ type: 'PortalRejected', reason: NO_DEVELOPMENTS }));
  }

  /** Los avisos con esos IDs, en el orden pedido. Los que ML no encuentra no están. */
  async #items(portal: PortalId, ids: readonly string[]): Promise<Result<Item[], CatalogError>> {
    const items: Item[] = [];
    for (let i = 0; i < ids.length; i += MULTIGET_SIZE) {
      const query = new URLSearchParams({ ids: ids.slice(i, i + MULTIGET_SIZE).join(',') });
      const read = await this.#api.get(portal, `/items?${query.toString()}`);
      if (read.isErr()) return err(catalogError(read.error));
      const parsed = MultigetSchema.safeParse(read.value);
      if (!parsed.success) {
        this.#api.unexpected(portal, '/items');
        return err({ type: 'PortalUnavailable' });
      }
      for (const entry of parsed.data) {
        if (entry.code !== 200) continue;
        const item = ItemSchema.safeParse(entry.body);
        if (item.success) items.push(item.data);
      }
    }
    return ok(items);
  }
}

/** Sin credenciales, para leer los avisos es "el portal no está configurado": hay que reconectar. */
function catalogError(error: MercadoLibreReadError): CatalogError {
  return error.type === 'PortalCredentialsMissing' ? { type: 'PortalNotConfigured' } : error;
}
