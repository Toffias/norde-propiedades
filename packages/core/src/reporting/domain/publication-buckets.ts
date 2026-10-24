/**
 * Difusión (#114): en qué contador cae cada publicación de un portal. Decisión de Norde
 * (2026-10-23), en `docs/negocio/decisiones.md`.
 *
 * - `published`: online en el portal; se abre en `simple` y `featured`.
 * - `pending`: pedida, esperando que el job la cree o la actualice.
 * - `paused`: pausada por el equipo o porque la propiedad está reservada.
 * - `review`: pausada o vencida por el portal (la conciliación diaria dejó el motivo): hay que
 *   revisarla.
 * - `error`: el portal la rechazó; no está publicada.
 * - `missing`: disponible (propiedad suelta o emprendimiento en comercialización) y sin aviso en
 *   ese portal.
 */
export const PUBLICATION_BUCKETS = [
  'published',
  'simple',
  'featured',
  'pending',
  'paused',
  'review',
  'error',
  'missing',
] as const;
export type PublicationBucket = (typeof PUBLICATION_BUCKETS)[number];

/** Simple o destacada: el nivel de exposición que se paga en el portal. */
export type PublicationTier = 'simple' | 'featured';

/**
 * Los planes de Zonaprop que no destacan el aviso. Cualquier otro plan contratado (`HOME`,
 * `SUPERDESTACADO`…) cuenta como destacada.
 */
export const SIMPLE_PLANS: readonly string[] = ['SIMPLE'];

/** Una publicación es destacada por su tipo (MercadoLibre) o por su plan (Zonaprop). */
export function publicationTier(listingType: string, plan: string | undefined): PublicationTier {
  if (listingType === 'featured') return 'featured';
  if (plan !== undefined && !SIMPLE_PLANS.includes(plan)) return 'featured';
  return 'simple';
}

/** Lo que tiene que estar disponible para que falte su aviso. */
export const PUBLISHABLE_PROPERTY_STATUS = 'available';
export const PUBLISHABLE_DEVELOPMENT_STATUS = 'marketing';

/**
 * Cómo se buscan las publicaciones de un contador:
 * - `listed`: avisos del portal en esos estados; `tier` filtra simples o destacadas y
 *   `portalPaused` separa las pausadas por el portal (con motivo) de las pausadas por el equipo.
 * - `missing`: lo disponible sin aviso vivo en el portal (uno dado de baja no cuenta).
 */
export type PublicationCriteria =
  | {
      readonly kind: 'listed';
      readonly statuses: readonly ('pending' | 'published' | 'paused' | 'error')[];
      readonly tier: PublicationTier | undefined;
      readonly portalPaused: boolean | undefined;
    }
  | { readonly kind: 'missing' };

export function publicationCriteria(bucket: PublicationBucket): PublicationCriteria {
  const listed = (
    statuses: readonly ('pending' | 'published' | 'paused' | 'error')[],
    extra: { tier?: PublicationTier; portalPaused?: boolean } = {},
  ): PublicationCriteria => ({
    kind: 'listed',
    statuses,
    tier: extra.tier,
    portalPaused: extra.portalPaused,
  });
  switch (bucket) {
    case 'published':
      return listed(['published']);
    case 'simple':
      return listed(['published'], { tier: 'simple' });
    case 'featured':
      return listed(['published'], { tier: 'featured' });
    case 'pending':
      return listed(['pending']);
    case 'paused':
      return listed(['paused'], { portalPaused: false });
    case 'review':
      return listed(['paused'], { portalPaused: true });
    case 'error':
      return listed(['error']);
    case 'missing':
      return { kind: 'missing' };
  }
}

/** Cuántas publicaciones hay de un estado, tipo y plan (un agregado de la base). */
export interface ListingTally {
  readonly status: string;
  readonly listingType: string;
  readonly plan: string | undefined;
  /** Si el portal dejó un motivo (la pausó o la venció él). */
  readonly hasReason: boolean;
  readonly count: number;
}

export type PublicationCounts = Readonly<Record<PublicationBucket, number>>;

/** Reparte los agregados en los contadores. `missing` se cuenta aparte. */
export function tallyPublications(tallies: readonly ListingTally[], missing: number) {
  const counts: Record<PublicationBucket, number> = {
    published: 0,
    simple: 0,
    featured: 0,
    pending: 0,
    paused: 0,
    review: 0,
    error: 0,
    missing,
  };
  for (const tally of tallies) {
    switch (tally.status) {
      case 'published':
        counts.published += tally.count;
        counts[publicationTier(tally.listingType, tally.plan)] += tally.count;
        break;
      case 'pending':
        counts.pending += tally.count;
        break;
      case 'paused':
        counts[tally.hasReason ? 'review' : 'paused'] += tally.count;
        break;
      case 'error':
        counts.error += tally.count;
        break;
    }
  }
  return counts satisfies PublicationCounts;
}
