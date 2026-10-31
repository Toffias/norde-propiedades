import type { NewsCard, NewsEntryRow, NewsKindValue } from '@norde/core/audit/contracts';
import type { PropertyStatusValue } from '@norde/core/properties/contracts';
import {
  ArrowLeftRightIcon,
  CalendarCheckIcon,
  CirclePlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  TrendingDownIcon,
  TrendingUpIcon,
  UserRoundCogIcon,
  type LucideIcon,
} from 'lucide-react';
import type { Route } from 'next';

import { PROPERTY_STATUS_DISPLAY } from '../../properties/labels';
import type { NewsLine } from '../news-format';

// Colores e íconos de cada tipo de noticia, compartidos por el resumen y sus secciones.

export type NewsTone = 'success' | 'info' | 'warning' | 'neutral';

export const KIND_TONES: Readonly<Record<NewsKindValue, NewsTone>> = {
  'client.created': 'success',
  'client.reassigned': 'info',
  'client.deleted': 'neutral',
  'property.created': 'success',
  'property.status_changed': 'info',
  'property.operation_changed': 'info',
  'property.price_changed': 'warning',
  'property.reservation': 'warning',
};

export const KIND_ICONS: Readonly<Record<NewsKindValue, LucideIcon>> = {
  'client.created': CirclePlusIcon,
  'client.reassigned': UserRoundCogIcon,
  'client.deleted': Trash2Icon,
  'property.created': CirclePlusIcon,
  'property.status_changed': RefreshCwIcon,
  'property.operation_changed': ArrowLeftRightIcon,
  'property.price_changed': TrendingUpIcon,
  'property.reservation': CalendarCheckIcon,
};

/** Fondo suave y texto del tono: íconos, pastillas y la variación del precio. */
export const TONE_SOFT: Readonly<Record<NewsTone, string>> = {
  success: 'bg-success-50 text-success-600 dark:bg-success-600/20 dark:text-success-300',
  info: 'bg-info-50 text-info-600 dark:bg-info-600/20 dark:text-info-300',
  warning: 'bg-warning-50 text-warning-700 dark:bg-warning-600/20 dark:text-warning-300',
  neutral: 'bg-muted text-muted-foreground',
};

/** Solo el texto del tono, para la frase del resumen. */
export const TONE_TEXT: Readonly<Record<NewsTone, string>> = {
  success: 'text-success-600 dark:text-success-300',
  info: 'text-info-600 dark:text-info-300',
  warning: 'text-warning-700 dark:text-warning-300',
  neutral: 'text-foreground',
};

/** Una bajada de precio va en verde; una suba, en ámbar; el resto, con el tono de su tipo. */
export function entryTone(entry: NewsEntryRow, line: NewsLine | undefined): NewsTone {
  if (line?.trend === 'down') return 'success';
  return KIND_TONES[entry.kind];
}

/** El ícono de una novedad: una bajada de precio lleva la flecha hacia abajo. */
export function EntryIcon({
  entry,
  line,
  className,
}: {
  readonly entry: NewsEntryRow;
  readonly line: NewsLine | undefined;
  readonly className: string;
}) {
  if (line?.trend === 'down') return <TrendingDownIcon className={className} aria-hidden />;
  return <KindIcon kind={entry.kind} className={className} />;
}

export function KindIcon({
  kind,
  className,
}: {
  readonly kind: NewsKindValue;
  readonly className: string;
}) {
  const Icon = KIND_ICONS[kind];
  return <Icon className={className} aria-hidden />;
}

export function entityUrl(card: NewsCard, tab?: 'historial'): Route {
  const base = card.entityType === 'property' ? '/propiedades' : '/contactos';
  return `${base}/${card.entityId}${tab === undefined ? '' : `?tab=${tab}`}` as Route; // Ruta dinámica de la ficha.
}

function isPropertyStatus(value: unknown): value is PropertyStatusValue {
  return typeof value === 'string' && value in PROPERTY_STATUS_DISPLAY;
}

/** El estado de antes y el de después de un cambio de estado, si el diff los trae. */
export function statusChange(entry: NewsEntryRow) {
  const change = entry.changes.status;
  const before = change?.before;
  const after = change?.after;
  if (!isPropertyStatus(before) || !isPropertyStatus(after)) return undefined;
  return { before: PROPERTY_STATUS_DISPLAY[before], after: PROPERTY_STATUS_DISPLAY[after] };
}
