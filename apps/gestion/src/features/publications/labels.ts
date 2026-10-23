import type { ListingOwnerKindValue } from '@norde/core/portals/contracts';
import type { PublicationBucketValue } from '@norde/core/reporting/contracts';
import type { StatusTone } from '@norde/ui/components/status-pill';

// Cómo se muestran los contadores de Difusión (#114).

export const BUCKET_LABELS: Readonly<
  Record<
    PublicationBucketValue,
    { readonly label: string; readonly hint: string; readonly tone: StatusTone }
  >
> = {
  published: { label: 'Publicadas', hint: 'Online en el portal', tone: 'green' },
  simple: { label: 'Simples', hint: 'Publicadas sin destacar', tone: 'gray' },
  featured: { label: 'Destacadas', hint: 'Publicadas con más exposición', tone: 'green' },
  pending: { label: 'Publicando', hint: 'En cola para mandar al portal', tone: 'amber' },
  paused: { label: 'Pausadas', hint: 'Por el equipo o por una reserva', tone: 'gray' },
  review: { label: 'A revisar', hint: 'Pausadas o vencidas por el portal', tone: 'amber' },
  error: { label: 'Con error', hint: 'El portal las rechazó: no están publicadas', tone: 'red' },
  missing: { label: 'Sin publicar', hint: 'Disponibles y sin aviso en el portal', tone: 'gray' },
};

/** El orden de las tarjetas de cada portal. */
export const COUNTER_ORDER: readonly PublicationBucketValue[] = [
  'published',
  'simple',
  'featured',
  'review',
  'error',
  'pending',
  'paused',
  'missing',
];

export const OWNER_KIND_LABELS: Readonly<Record<ListingOwnerKindValue, string>> = {
  property: 'Propiedades',
  development: 'Emprendimientos',
};
