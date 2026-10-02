// Contracts del módulo properties (`@norde/core/properties/contracts`): importables desde el cliente.

import { z } from 'zod';

import { bulkSelectionSchema, pageQuerySchema } from '../../shared/contracts';

import {
  CURRENCIES,
  MANUAL_STATUS_VALUES,
  OPERATIONS,
  PROPERTY_STATUS_VALUES,
  PROPERTY_TYPES,
  type Currency,
  type Operation,
  type PropertyStatusValue,
  type PropertyType,
} from './values';
import { AmountSchema } from './amount';

export * from './values';
export * from './catalog';
export * from './detail';
export * from './media';
export * from './documents';
export { AmountSchema } from './amount';

/** Tope de la búsqueda pública (web y agente). El panel usa el `MAX_PAGE_SIZE` de shared. */
export const MAX_PAGE_SIZE = 10;

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
    /**
     * Ubicación del catálogo (por buscador). Con ella, barrio, localidad y provincia salen de la
     * ubicación; sin ella, se cargan a mano.
     */
    locationId: z.uuid().optional(),
    neighborhood: OptionalText(80),
    city: OptionalText(80),
    province: OptionalText(80),
    /** Vacío: se sugiere a partir de la calle y la altura ("Gurruchaga al 1800"). */
    publishAddress: OptionalText(150),
    /** Vacío: se sugiere a partir del tipo, la operación y el barrio. */
    portalTitle: OptionalText(120),
    ...CoordinateFields,
  })
  .refine((input) => (input.latitude === undefined) === (input.longitude === undefined), {
    message: 'Completá la latitud y la longitud, o ninguna de las dos.',
    path: ['longitude'],
  })
  .superRefine((input, ctx) => {
    if (input.locationId !== undefined) return;
    const missing = (['neighborhood', 'city', 'province'] as const).filter(
      (field) => input[field] === undefined,
    );
    if (missing.length === 0) return;
    // El formulario muestra el buscador o los tres campos: el aviso va en los dos lugares.
    for (const field of ['locationId', ...missing] as const) {
      ctx.addIssue({
        code: 'custom',
        message:
          field === 'locationId'
            ? 'Elegí la ubicación en el buscador o cargala a mano.'
            : 'Completá barrio, localidad y provincia, o elegí la ubicación en el buscador.',
        path: [field],
      });
    }
  });
export type CreatePropertyInput = z.input<typeof CreatePropertyInputSchema>;
export type CreatePropertyValues = z.output<typeof CreatePropertyInputSchema>;

/** Qué pasó con las coordenadas al dar de alta. */
export const GEOCODING_OUTCOMES = ['manual', 'found', 'not_found', 'failed'] as const;
export type GeocodingOutcome = (typeof GEOCODING_OUTCOMES)[number];

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

/** Cómo se muestran los resultados del buscador: grilla, tarjetas o mapa. */
export const PROPERTY_LAYOUT_VALUES = ['list', 'cards', 'map'] as const;
export type PropertyLayoutValue = (typeof PROPERTY_LAYOUT_VALUES)[number];

/** Filtros del buscador del panel: los comparten la grilla, el mapa y las acciones masivas. */
const PanelPropertyFilterFields = {
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
};

/** El precio se filtra y se ordena en una sola moneda: sin moneda no hay rango ni orden por precio. */
function checkPriceFilters(
  query: {
    readonly currency?: Currency | undefined;
    readonly minPrice?: bigint | undefined;
    readonly maxPrice?: bigint | undefined;
    readonly sort?: { readonly field: string } | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  if (query.currency !== undefined) return;
  for (const field of ['minPrice', 'maxPrice'] as const) {
    if (query[field] !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Elegí la moneda para filtrar por precio.',
        path: [field],
      });
    }
  }
  if (query.sort?.field === 'price') {
    ctx.addIssue({
      code: 'custom',
      message: 'Elegí la moneda para ordenar por precio.',
      path: ['sort'],
    });
  }
}

/**
 * Buscador del panel: ve borradores y datos internos, a diferencia de `SearchPropertiesInputSchema`
 * (la búsqueda pública).
 */
export const ListPanelPropertiesQuerySchema = pageQuerySchema({
  sortable: PANEL_PROPERTY_SORT_FIELDS,
  defaultSort: { field: 'updatedAt', direction: 'desc' },
})
  .extend(PanelPropertyFilterFields)
  .superRefine(checkPriceFilters);
export type ListPanelPropertiesQuery = z.input<typeof ListPanelPropertiesQuerySchema>;

/** Los filtros del buscador sin página ni orden (acciones masivas sobre "todos los que cumplen"). */
export const PanelPropertyFilterSchema = z
  .object(PanelPropertyFilterFields)
  .superRefine(checkPriceFilters);
export type PanelPropertyFilter = z.input<typeof PanelPropertyFilterSchema>;

/** Las propiedades marcadas en la página, o todas las que cumplen los filtros. */
export const PropertySelectionSchema = bulkSelectionSchema(PanelPropertyFilterSchema);
export type PropertySelection = z.input<typeof PropertySelectionSchema>;

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

/** Atributos que muestran las columnas configurables, las tarjetas y el comparador. */
export interface PanelPropertyAttributes {
  readonly rooms: number | undefined;
  readonly bedrooms: number | undefined;
  readonly bathrooms: number | undefined;
  readonly parkingSpaces: number | undefined;
  readonly ageYears: number | undefined;
  readonly surfaceTotalM2: number | undefined;
  readonly surfaceCoveredM2: number | undefined;
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
  readonly province: string;
  readonly operations: readonly PanelPropertyOperation[];
  readonly attributes: PanelPropertyAttributes;
  /** Foto de portada (`media_items`). */
  readonly coverImageUrl: string | undefined;
  readonly coordinates: { readonly latitude: number; readonly longitude: number } | undefined;
  readonly producer: UserRef | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Solo en la papelera. */
  readonly deletedAt: Date | undefined;
  readonly deletedBy: UserRef | undefined;
}

// ---------- Mapa ----------

/** Pines por pedido: más que esto no se distingue en pantalla; se pide acercar el mapa. */
export const MAX_MAP_PINS = 500;

const Latitude = z.coerce.number().min(-90).max(90);
const Longitude = z.coerce.number().min(-180).max(180);

/** Los filtros del buscador más el rectángulo visible del mapa. */
export const PropertyMapQuerySchema = z
  .object({
    ...PanelPropertyFilterFields,
    south: Latitude,
    west: Longitude,
    north: Latitude,
    east: Longitude,
  })
  .superRefine(checkPriceFilters)
  .refine((query) => query.south <= query.north && query.west <= query.east, {
    message: 'El área del mapa no es válida.',
    path: ['north'],
  });
export type PropertyMapQuery = z.input<typeof PropertyMapQuerySchema>;

export interface PropertyMapPin {
  readonly id: string;
  readonly code: string;
  readonly status: PropertyStatusValue;
  readonly propertyType: PropertyType;
  readonly portalTitle: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly operations: readonly PanelPropertyOperation[];
}

export interface PropertyMapResult {
  readonly pins: readonly PropertyMapPin[];
  /** Cuántas propiedades del área cumplen los filtros. */
  readonly total: number;
  /** Hay más de `MAX_MAP_PINS`: se muestran las actualizadas más recientemente. */
  readonly truncated: boolean;
}

// ---------- Comparar ----------

export const MIN_COMPARE = 2;
export const MAX_COMPARE = 4;

export const ComparePropertiesQuerySchema = z.object({
  /** En la URL viajan separados por coma (`?ids=a,b,c`). */
  ids: z.preprocess(
    (value) => (typeof value === 'string' ? value.split(',').filter((id) => id !== '') : value),
    z
      .array(z.uuid())
      .min(MIN_COMPARE, `Elegí al menos ${MIN_COMPARE} propiedades para comparar.`)
      .max(MAX_COMPARE, `Se comparan hasta ${MAX_COMPARE} propiedades a la vez.`),
  ),
});
export type ComparePropertiesQuery = z.input<typeof ComparePropertiesQuerySchema>;

// ---------- Propiedades en la ficha de un contacto (#8) ----------

/** Las propiedades de las que un contacto es propietario (`property_owners`). */
export const ListOwnedPropertiesQuerySchema = pageQuerySchema({
  sortable: ['updatedAt', 'createdAt', 'code'],
  defaultSort: { field: 'updatedAt', direction: 'desc' },
}).extend({ clientId: z.uuid() });
export type ListOwnedPropertiesQuery = z.input<typeof ListOwnedPropertiesQuerySchema>;

/** Cuántas propiedades se resumen de una vez (las de una página de otro listado). */
export const MAX_PROPERTY_SUMMARIES = 100;

export const GetPropertySummariesInputSchema = z.object({
  ids: z.array(z.uuid()).max(MAX_PROPERTY_SUMMARIES),
});
export type GetPropertySummariesInput = z.input<typeof GetPropertySummariesInputSchema>;

// ---------- Exportar ----------

export const PROPERTY_EXPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export type PropertyExportFormat = (typeof PROPERTY_EXPORT_FORMATS)[number];

/** Sin `properties:export-bulk` se exporta hasta esta cantidad. */
export const EXPORT_WITHOUT_BULK_PERMISSION = 10;
/** Una planilla más grande conviene pedirla filtrando: se arma por lotes, pero tiene un tope. */
export const MAX_EXPORT_ROWS = 5000;
/** El PDF tiene una ficha resumida por propiedad: más que esto no se imprime ni se lee. */
export const MAX_PDF_EXPORT_ROWS = 100;

export const ExportPropertiesInputSchema = z.object({
  format: z.enum(PROPERTY_EXPORT_FORMATS),
  selection: PropertySelectionSchema,
});
export type ExportPropertiesInput = z.input<typeof ExportPropertiesInputSchema>;

// ---------- Edición rápida masiva ----------

/** Tope de propiedades por edición masiva: se procesan por lotes, cada lote en su transacción. */
export const MAX_BULK_EDIT = 2000;

export const BulkEditChangeSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('status'), status: z.enum(MANUAL_STATUS_VALUES) }),
  z.object({
    field: z.literal('price'),
    operation: z.enum(OPERATIONS),
    currency: z.enum(CURRENCIES),
    /** Vacío: "precio a consultar". */
    price: AmountSchema.optional(),
  }),
  z.object({ field: z.literal('producer'), userId: z.uuid() }),
  z
    .object({
      field: z.literal('tags'),
      add: z.array(z.uuid()).max(20).default([]),
      remove: z.array(z.uuid()).max(20).default([]),
    })
    .refine((change) => change.add.length + change.remove.length > 0, {
      message: 'Elegí al menos una etiqueta para agregar o quitar.',
      path: ['add'],
    }),
]);
export type BulkEditChange = z.input<typeof BulkEditChangeSchema>;

export const BulkEditPropertiesInputSchema = z.object({
  selection: PropertySelectionSchema,
  change: BulkEditChangeSchema,
});
export type BulkEditPropertiesInput = z.input<typeof BulkEditPropertiesInputSchema>;

/** Por qué no se cambió una propiedad de la selección. */
export const BULK_SKIP_REASONS = [
  'forbidden',
  'in_trash',
  'invalid_transition',
  'operation_not_found',
] as const;
export type BulkSkipReason = (typeof BULK_SKIP_REASONS)[number];

export interface BulkEditResult {
  /** Propiedades que cambiaron. */
  readonly updated: number;
  /** Ya tenían ese valor. */
  readonly unchanged: number;
  /** Las que no se pudieron cambiar, con el motivo (como mucho las primeras 20). */
  readonly skipped: readonly { readonly code: string; readonly reason: BulkSkipReason }[];
  readonly skippedCount: number;
}
