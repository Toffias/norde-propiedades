import type {
  BackgroundTaskKind,
  BackgroundTaskRow,
  BackgroundTaskStatus,
} from '@norde/core/reporting/contracts';
import type { StatusTone } from '@norde/ui/components/status-pill';

import { PORTAL_LABELS } from '../portals/messages';
import { DOCUMENT_KIND_LABELS } from '../properties/detail-labels';

// Cómo se muestran en las notificaciones de la barra (la campana) los procesos en segundo plano.

/**
 * Hasta cuándo limpió los terminados quien usa el navegador (ISO 8601). Es una preferencia de
 * pantalla, como los tipos del buscador: va en una cookie y el servidor la lee al pedir la lista.
 */
export const BACKGROUND_TASKS_CLEARED_COOKIE = 'norde-background-tasks-cleared';

/** La cookie es editable a mano: solo vale una fecha ISO. */
export function parseClearedAt(value: string | undefined): string | undefined {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value)) return undefined;
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

/** Cada cuánto se vuelve a preguntar mientras algo sigue en curso, con el panel abierto o no. */
export const OPEN_POLL_MS = 5_000;
export const CLOSED_POLL_MS = 15_000;

export const STATUS_DISPLAY: Readonly<
  Record<BackgroundTaskStatus, { readonly label: string; readonly tone: StatusTone }>
> = {
  pending: { label: 'En espera', tone: 'gray' },
  running: { label: 'Procesando', tone: 'amber' },
  done: { label: 'Listo', tone: 'green' },
  failed: { label: 'Con error', tone: 'red' },
};

const KIND_LABELS: Readonly<Record<Exclude<BackgroundTaskKind, 'media_variants'>, string>> = {
  import_media: 'Fotos de la importación de Tokko',
  client_import: 'Importación de contactos',
  property_import: 'Importación de propiedades',
  unit_import: 'Importación de unidades',
  tokko_users_import: 'Usuarios de Tokko',
  opportunity_bulk: 'Acción masiva de oportunidades',
  property_document: 'PDF de la ficha',
  portal_listing: 'Publicación en portales',
};

const MEDIA_TITLES: Readonly<Record<BackgroundTaskStatus, string>> = {
  pending: 'Fotos en espera',
  // Las fotos ya están subidas: "Procesando" se leería como que todavía se están cargando.
  running: 'Generando variantes',
  done: 'Variantes generadas',
  failed: 'Variantes con error',
};

const BULK_ACTION_LABELS: Readonly<Record<string, string>> = {
  change_stage: 'Cambio de estado',
  close: 'Cierre',
  reassign: 'Reasignación',
};

const FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  file_missing: 'No se encontró el archivo subido.',
  unreadable_file: 'No se pudo leer el archivo.',
  too_many_rows: 'El archivo tiene demasiadas filas.',
  source_unavailable: 'Tokko no respondió.',
  tokko_unavailable: 'Tokko no respondió.',
  development_unavailable: 'El emprendimiento ya no está disponible.',
  agent_role_missing: 'Falta el rol Agente en Mi empresa.',
  main_branch_missing: 'Falta la sucursal principal en Mi empresa.',
  requester_unavailable: 'Quien la pidió ya no tiene acceso.',
  invalid_request: 'El pedido ya no es válido.',
};

function lookup(labels: Readonly<Record<string, string>>, key: string | undefined) {
  return key === undefined ? undefined : labels[key];
}

/** El estado de la fila. En las fotos, "Procesando" se leería como que todavía se suben. */
export function taskStatus(task: BackgroundTaskRow): {
  readonly label: string;
  readonly tone: StatusTone;
} {
  const status = STATUS_DISPLAY[task.status];
  return isMedia(task) && task.status === 'running' ? { ...status, label: 'En curso' } : status;
}

/** Las variantes de fotos: las de una ficha o las que trajo una importación. */
function isMedia(task: BackgroundTaskRow): boolean {
  return task.kind === 'media_variants' || task.kind === 'import_media';
}

/** El título del proceso: qué es y, si corre sobre una ficha, cuál. */
export function taskTitle(task: BackgroundTaskRow): string {
  switch (task.kind) {
    case 'media_variants':
      return MEDIA_TITLES[task.status];
    case 'property_import':
      return task.detail === 'api'
        ? 'Importación de propiedades desde Tokko'
        : KIND_LABELS.property_import;
    case 'property_document':
      return lookup(DOCUMENT_KIND_LABELS, task.detail) ?? KIND_LABELS.property_document;
    case 'portal_listing':
      return `Publicación en ${lookup(PORTAL_LABELS, task.detail) ?? 'portales'}`;
    case 'opportunity_bulk': {
      const action = lookup(BULK_ACTION_LABELS, task.detail);
      return action === undefined ? KIND_LABELS.opportunity_bulk : `${action} de oportunidades`;
    }
    case 'import_media':
    case 'client_import':
    case 'unit_import':
    case 'tokko_users_import':
      return KIND_LABELS[task.kind];
  }
}

/** La segunda línea: la ficha, el archivo importado o nada. */
export function taskSubtitle(task: BackgroundTaskRow): string | undefined {
  const { subject } = task;
  if (subject?.kind === 'property') {
    return subject.title === '' ? subject.code : `${subject.code} · ${subject.title}`;
  }
  if (subject?.kind === 'development') return subject.name;
  const imports: readonly BackgroundTaskKind[] = [
    'client_import',
    'unit_import',
    'property_import',
  ];
  return imports.includes(task.kind) && task.detail !== 'api' ? task.detail : undefined;
}

/** "1.200 de 2.780", con el separador de miles de Argentina. */
export function formatProgress(progress: BackgroundTaskRow['progress']): string | undefined {
  if (progress === undefined) return undefined;
  const number = new Intl.NumberFormat('es-AR');
  return `${number.format(progress.done)} de ${number.format(progress.total)}`;
}

/** Por qué falló, listo para mostrar. El mensaje de un portal ya viene en español. */
export function taskFailure(task: BackgroundTaskRow): string | undefined {
  if (task.status !== 'failed') return undefined;
  if (task.kind === 'portal_listing') return task.failure ?? 'El portal rechazó la publicación.';
  if (isMedia(task)) {
    return task.problems === 1
      ? 'No se pudieron generar las variantes de una foto.'
      : `No se pudieron generar las variantes de ${String(task.problems)} fotos.`;
  }
  if (task.kind === 'property_document') return 'No se pudo generar el PDF.';
  return lookup(FAILURE_MESSAGES, task.failure) ?? 'No se pudo terminar.';
}

/** Lo que salió bien a medias: filas con problemas, fotos fallidas u oportunidades salteadas. */
export function taskProblems(task: BackgroundTaskRow): string | undefined {
  if (task.problems === 0 || task.status === 'failed') return undefined;
  const count = String(task.problems);
  switch (task.kind) {
    case 'media_variants':
    case 'import_media':
      return task.problems === 1 ? 'Una foto con error' : `${count} fotos con error`;
    case 'opportunity_bulk':
      return task.problems === 1 ? 'Una salteada' : `${count} salteadas`;
    case 'tokko_users_import':
      return task.problems === 1 ? 'Uno sin email' : `${count} sin email`;
    case 'client_import':
    case 'property_import':
    case 'unit_import':
    case 'property_document':
    case 'portal_listing':
      return task.problems === 1 ? 'Una fila con problemas' : `${count} filas con problemas`;
  }
}

function subjectHref(task: BackgroundTaskRow, tab: string): string | undefined {
  if (task.subject?.kind === 'property') return `/propiedades/${task.subject.id}?tab=${tab}`;
  if (task.subject?.kind === 'development') return `/emprendimientos/${task.subject.id}?tab=${tab}`;
  return undefined;
}

/** A dónde lleva cada proceso: el reporte de la importación, la ficha o el pipeline. */
export function taskHref(task: BackgroundTaskRow): string | undefined {
  switch (task.kind) {
    case 'media_variants':
      return subjectHref(task, 'multimedia');
    case 'portal_listing':
      return subjectHref(task, 'difusion');
    case 'property_document':
      return task.status === 'done' && task.subject?.kind === 'property'
        ? `/propiedades/${task.subject.id}/documentos/${task.sourceId}`
        : subjectHref(task, 'detalles');
    case 'client_import':
      return `/contactos/importaciones?panel=${task.sourceId}`;
    case 'property_import':
    case 'import_media':
      return `/propiedades/importaciones?panel=${task.sourceId}`;
    case 'unit_import':
      return task.subject?.kind === 'development'
        ? `/emprendimientos/${task.subject.id}/importaciones?panel=${task.sourceId}`
        : undefined;
    case 'tokko_users_import':
      return '/mi-empresa/usuarios';
    case 'opportunity_bulk':
      return '/oportunidades';
  }
}

/** Hasta dónde se limpia: el terminado más reciente (los terminados vienen de más nuevo a más viejo). */
export function clearedUntil(tasks: readonly BackgroundTaskRow[]): string | undefined {
  const latest = tasks.find((task) => task.finishedAt !== undefined)?.finishedAt;
  return latest?.toISOString();
}
