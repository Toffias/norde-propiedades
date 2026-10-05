// Noticias (#16): qué entradas del historial son noticia para el equipo y de qué tipo. El feed se lee
// de `audit_log`; ningún módulo escribe noticias a mano.

/** Tipos de noticia, en el orden del selector. */
export const NEWS_KINDS = [
  'client.created',
  'client.reassigned',
  'client.deleted',
  'property.created',
  'property.status_changed',
  'property.operation_changed',
  'property.price_changed',
  'property.reservation',
] as const;
export type NewsKind = (typeof NEWS_KINDS)[number];

/** Entidades con noticias: cada tarjeta del feed es una de estas, en un día. */
export const NEWS_ENTITY_TYPES = ['property', 'client'] as const;
export type NewsEntityType = (typeof NEWS_ENTITY_TYPES)[number];

/** Acciones del historial que son noticia por sí solas. */
export const NEWS_ACTION_KINDS: Readonly<Record<string, NewsKind>> = {
  'client.created': 'client.created',
  'client.registered': 'client.created',
  'client.reassigned': 'client.reassigned',
  'client.deleted': 'client.deleted',
  'property.created': 'property.created',
  'property.created_from_appraisal': 'property.created',
  'property.status_changed': 'property.status_changed',
  'property.reserved': 'property.reservation',
  'property.reservation_fallen': 'property.reservation',
  'property.reservation_signed': 'property.reservation',
};

/**
 * La edición de una propiedad (ficha o edición masiva) es noticia solo si tocó sus operaciones: es
 * un cambio de operación o de precio según `newsKindOf`.
 */
export const PROPERTY_EDIT_ACTION = 'property.updated';
export const OPERATIONS_FIELD = 'operations';

/** Todas las acciones que pueden ser noticia, para acotar la lectura del historial. */
export const NEWS_ACTIONS: readonly string[] = [
  ...Object.keys(NEWS_ACTION_KINDS),
  PROPERTY_EDIT_ACTION,
];

interface Change {
  readonly before: unknown;
  readonly after: unknown;
}

interface OperationPrice {
  readonly operation: string;
  readonly currency: string;
  readonly priceCents: string;
}

function operationsOf(value: unknown): readonly OperationPrice[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return [];
    const price = 'priceCents' in item ? item.priceCents : undefined;
    return [
      {
        operation: 'operation' in item && typeof item.operation === 'string' ? item.operation : '',
        currency: 'currency' in item && typeof item.currency === 'string' ? item.currency : '',
        priceCents: typeof price === 'bigint' || typeof price === 'number' ? String(price) : '',
      },
    ];
  });
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = [...new Set(a)].sort();
  const right = [...new Set(b)].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * El tipo de noticia de una entrada del historial, o `undefined` si no es noticia.
 *
 * Una edición de operaciones es un cambio de operación si cambió el conjunto de operaciones (venta,
 * alquiler…), aunque también haya cambiado un precio; si no, es un cambio de precio si cambió algún
 * precio o su moneda. Cambiar solo la comisión o "precio a consultar" no es noticia.
 *
 * `DrizzleNewsFeedQuery` repite esta regla en SQL para filtrar y paginar en la base: si cambia
 * acá, cambia allá (lo cubre su test de integración con los mismos casos).
 */
export function newsKindOf(
  action: string,
  changes: Readonly<Record<string, Change>>,
): NewsKind | undefined {
  const kind = NEWS_ACTION_KINDS[action];
  if (kind !== undefined) return kind;
  if (action !== PROPERTY_EDIT_ACTION) return undefined;
  const change = changes[OPERATIONS_FIELD];
  if (change === undefined) return undefined;
  const before = operationsOf(change.before);
  const after = operationsOf(change.after);
  if (before === undefined || after === undefined) return undefined;
  if (
    !sameSet(
      before.map((o) => o.operation),
      after.map((o) => o.operation),
    )
  ) {
    return 'property.operation_changed';
  }
  const price = (o: OperationPrice) => `${o.operation}|${o.currency}|${o.priceCents}`;
  return sameSet(before.map(price), after.map(price)) ? undefined : 'property.price_changed';
}
