// Contracts del módulo properties (`@norde/core/properties/contracts`): importables desde el cliente.

import { z } from 'zod';

import { pageQuerySchema } from '../../shared/contracts';

export const OPERATIONS = ['sale', 'rent', 'temporary_rent'] as const;
export type Operation = (typeof OPERATIONS)[number];

export const PROPERTY_TYPES = [
  'apartment',
  'house',
  'ph',
  'land',
  'office',
  'commercial',
  'garage',
  'warehouse',
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const CURRENCIES = ['ARS', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Tope de la búsqueda pública (web y agente). El panel usa el `MAX_PAGE_SIZE` de shared. */
export const MAX_PAGE_SIZE = 10;

export const PROPERTY_STATUS_VALUES = [
  'draft',
  'available',
  'reserved',
  'sold',
  'rented',
  'paused',
  'withdrawn',
] as const;
export type PropertyStatusValue = (typeof PROPERTY_STATUS_VALUES)[number];

export const SearchPropertiesInputSchema = z.object({
  operation: z.enum(OPERATIONS).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  /** Barrio, localidad o zona en texto libre. */
  location: z.string().trim().min(1).max(100).optional(),
  currency: z.enum(CURRENCIES).optional(),
  minPriceCents: z.bigint().nonnegative().optional(),
  maxPriceCents: z.bigint().nonnegative().optional(),
  minRooms: z.int().min(0).max(50).optional(),
  maxRooms: z.int().min(0).max(50).optional(),
  minBedrooms: z.int().min(0).max(50).optional(),
  minSurfaceM2: z.number().positive().max(1_000_000).optional(),
  amenities: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  page: z.int().min(1).max(1000).default(1),
  pageSize: z.int().min(1).max(MAX_PAGE_SIZE).default(3),
});

export type SearchPropertiesInput = z.input<typeof SearchPropertiesInputSchema>;

export interface MoneyDto {
  readonly amountCents: bigint;
  readonly currency: Currency;
}

export interface PropertySummary {
  readonly id: string;
  readonly code: string;
  readonly slug: string;
  readonly title: string;
  readonly operation: Operation;
  readonly propertyType: PropertyType;
  /** `null`: "precio a consultar". */
  readonly price: MoneyDto | null;
  readonly expenses: MoneyDto | null;
  readonly rooms: number | null;
  readonly bedrooms: number | null;
  readonly bathrooms: number | null;
  readonly surfaceTotalM2: number | null;
  readonly surfaceCoveredM2: number | null;
  readonly neighborhood: string;
  readonly city: string;
  readonly amenities: readonly string[];
  readonly coverImageUrl: string | null;
  readonly photoCount: number;
}

export interface PropertyDetail extends PropertySummary {
  readonly description: string;
  /** `null` si la propiedad no muestra la dirección exacta. */
  readonly address: string | null;
  readonly imageUrls: readonly string[];
}

// ---------- Panel de gestión ----------

/** Monto en unidades con hasta dos decimales ("150000", "1500,50"): así lo escribe el usuario. */
const AMOUNT = /^\d{1,12}(?:[.,]\d{1,2})?$/;

/** "1500,5" → 150050n. Exacto: no pasa por `number`. */
function amountToCents(amount: string): bigint {
  const [units = '0', fraction = ''] = amount.replace(',', '.').split('.');
  return BigInt(units) * 100n + BigInt(fraction.padEnd(2, '0'));
}

const AmountSchema = z
  .string()
  .trim()
  .regex(AMOUNT, 'Ingresá un monto sin puntos de miles, con hasta dos decimales.')
  .transform(amountToCents);

const OptionalText = (max: number) => z.string().trim().min(1).max(max).optional();

const CoordinateFields = {
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
};

export const CreatePropertyInputSchema = z
  .object({
    propertyType: z.enum(PROPERTY_TYPES),
    operation: z.enum(OPERATIONS),
    currency: z.enum(CURRENCIES),
    /** En unidades; se guarda en centavos. Opcional: el precio se puede cargar en la ficha. */
    price: AmountSchema.optional(),
    /** Calle, altura, piso y unidad son privados. */
    street: z.string().trim().min(1).max(120),
    streetNumber: OptionalText(20),
    floor: OptionalText(10),
    unit: OptionalText(10),
    neighborhood: z.string().trim().min(1).max(80),
    city: z.string().trim().min(1).max(80),
    province: z.string().trim().min(1).max(80),
    /** Vacío: se sugiere a partir de la calle y la altura ("Gurruchaga al 1800"). */
    publishAddress: OptionalText(150),
    /** Vacío: se sugiere a partir del tipo, la operación y el barrio. */
    portalTitle: OptionalText(120),
    ...CoordinateFields,
  })
  .refine((input) => (input.latitude === undefined) === (input.longitude === undefined), {
    message: 'Completá la latitud y la longitud, o ninguna de las dos.',
    path: ['longitude'],
  });
export type CreatePropertyInput = z.input<typeof CreatePropertyInputSchema>;

export const PropertyIdInputSchema = z.object({ propertyId: z.uuid() });
export type PropertyIdInput = z.input<typeof PropertyIdInputSchema>;

export const PANEL_PROPERTY_SORT_FIELDS = ['updatedAt', 'createdAt', 'price', 'code'] as const;
export type PanelPropertySortField = (typeof PANEL_PROPERTY_SORT_FIELDS)[number];

/** `mine`: mis captaciones. `branch`: las de mi sucursal. */
export const PROPERTY_SCOPE_VALUES = ['all', 'mine', 'branch'] as const;
export type PropertyScopeValue = (typeof PROPERTY_SCOPE_VALUES)[number];

/** `trash`: la papelera. */
export const PROPERTY_VIEW_VALUES = ['active', 'trash'] as const;
export type PropertyViewValue = (typeof PROPERTY_VIEW_VALUES)[number];

/**
 * Buscador del panel: ve borradores y datos internos, a diferencia de `SearchPropertiesInputSchema`
 * (la búsqueda pública). El precio se filtra y se ordena en una sola moneda: sin moneda no hay
 * rango ni orden por precio.
 */
export const ListPanelPropertiesQuerySchema = pageQuerySchema({
  sortable: PANEL_PROPERTY_SORT_FIELDS,
  defaultSort: { field: 'updatedAt', direction: 'desc' },
})
  .extend({
    /** Código, título o dirección, sin distinguir mayúsculas ni acentos. */
    q: z.string().trim().min(1).max(100).optional(),
    operation: z.enum(OPERATIONS).optional(),
    propertyType: z.enum(PROPERTY_TYPES).optional(),
    status: z.enum(PROPERTY_STATUS_VALUES).optional(),
    /** Barrio, localidad o provincia. */
    location: z.string().trim().min(1).max(100).optional(),
    currency: z.enum(CURRENCIES).optional(),
    minPrice: AmountSchema.optional(),
    maxPrice: AmountSchema.optional(),
    scope: z.enum(PROPERTY_SCOPE_VALUES).default('all'),
    view: z.enum(PROPERTY_VIEW_VALUES).default('active'),
  })
  .refine((query) => query.minPrice === undefined || query.currency !== undefined, {
    message: 'Elegí la moneda para filtrar por precio.',
    path: ['minPrice'],
  })
  .refine((query) => query.maxPrice === undefined || query.currency !== undefined, {
    message: 'Elegí la moneda para filtrar por precio.',
    path: ['maxPrice'],
  })
  .refine((query) => query.sort.field !== 'price' || query.currency !== undefined, {
    message: 'Elegí la moneda para ordenar por precio.',
    path: ['sort'],
  });
export type ListPanelPropertiesQuery = z.input<typeof ListPanelPropertiesQuerySchema>;

export interface PanelPropertyOperation {
  readonly operation: Operation;
  readonly currency: Currency;
  /** `null`: sin precio cargado o "precio a consultar". */
  readonly priceCents: bigint | null;
}

export interface UserRef {
  readonly id: string;
  /** `undefined` si el usuario ya no está activo. */
  readonly name: string | undefined;
}

/** Fila del buscador del panel. */
export interface PanelPropertyRow {
  readonly id: string;
  readonly code: string;
  readonly propertyType: PropertyType;
  readonly status: PropertyStatusValue;
  readonly portalTitle: string;
  readonly publishAddress: string | undefined;
  readonly neighborhood: string;
  readonly city: string;
  readonly operations: readonly PanelPropertyOperation[];
  readonly producer: UserRef | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Solo en la papelera. */
  readonly deletedAt: Date | undefined;
  readonly deletedBy: UserRef | undefined;
}
