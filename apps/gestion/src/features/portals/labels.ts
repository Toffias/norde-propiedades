import type {
  ListingOperationValue,
  ListingStatusValue,
  ListingTypeValue,
} from '@norde/core/portals/contracts';
import type { StatusTone } from '@norde/ui/components/status-pill';

// Cómo se muestran en la pestaña Difusión los valores de las publicaciones.

export const LISTING_STATUS_LABELS: Readonly<
  Record<ListingStatusValue, { readonly label: string; readonly tone: StatusTone }>
> = {
  pending: { label: 'Publicando…', tone: 'amber' },
  published: { label: 'Publicada', tone: 'green' },
  paused: { label: 'Pausada', tone: 'amber' },
  error: { label: 'Con error', tone: 'red' },
  unpublished: { label: 'Dada de baja', tone: 'gray' },
};

export const LISTING_TYPE_LABELS: Readonly<Record<ListingTypeValue, string>> = {
  simple: 'Simple',
  featured: 'Destacado',
};

export const LISTING_OPERATION_LABELS: Readonly<Record<ListingOperationValue, string>> = {
  sale: 'Venta',
  rent: 'Alquiler',
  temporary_rent: 'Alquiler temporario',
};
