import type { ContactChannel } from './contact-channel';
import { normalizeName } from './duplicate-check';
import type { OpportunityType } from './opportunity';
import type { CloseReasonRating } from './opportunity-close-reason';
import type { OpportunityStatus } from './opportunity-status';

// Cómo se traduce la oportunidad que trae la exportación de contactos de Tokko (en Tokko el
// contacto es la oportunidad). Decidido con Norde el 2026-10-20 (`docs/negocio/decisiones.md`).

/** El estado de Tokko: abierto en una categoría de Norde, o cerrado (con un motivo). */
export type TokkoOpportunityState =
  { readonly closed: false; readonly category: OpportunityStatus } | { readonly closed: true };

const STATES: Readonly<Record<string, TokkoOpportunityState>> = {
  'pendiente contactar': { closed: false, category: 'new' },
  'tomar accion': { closed: false, category: 'contacted' },
  cerrado: { closed: true },
};

/** `undefined` si Tokko trae un estado que no se conoce. */
export function tokkoOpportunityState(raw: string): TokkoOpportunityState | undefined {
  return STATES[normalizeName(raw)];
}

/** Un motivo de cierre de Norde: se busca por nombre y, si no está, se crea con esa calificación. */
export interface CloseReasonTarget {
  readonly name: string;
  readonly rating: CloseReasonRating;
}

const WITH_NORDE: CloseReasonTarget = { name: 'Compró o alquiló con Norde', rating: 'positive' };
const WITH_OTHER: CloseReasonTarget = {
  name: 'Compró o alquiló con otra inmobiliaria',
  rating: 'negative',
};
const NO_ANSWER: CloseReasonTarget = { name: 'No respondió', rating: 'negative' };
const STOPPED: CloseReasonTarget = { name: 'Dejó de buscar', rating: 'negative' };
const APPRAISAL: CloseReasonTarget = { name: 'Tasación exitosa', rating: 'positive' };
const OTHER: CloseReasonTarget = { name: 'Otro', rating: 'negative' };

const REASONS: Readonly<Record<string, CloseReasonTarget>> = {
  'alquilo con nosotros': WITH_NORDE,
  'compro con nosotros': WITH_NORDE,
  'alquilo con otro': WITH_OTHER,
  'compro con otro': WITH_OTHER,
  fantasma: NO_ANSWER,
  'sin seguimiento': STOPPED,
  'es propietario - tasacion exitosa': APPRAISAL,
  other: OTHER,
  otro: OTHER,
};

export interface TokkoCloseReason {
  readonly target: CloseReasonTarget;
  /** La nota entre paréntesis y, si el motivo no se conocía, cuál era. */
  readonly note: string | undefined;
  /** Qué operación sugiere el motivo ("Alquiló con…" es un alquiler). */
  readonly type: OpportunityType | undefined;
}

/** Una nota con menos de 3 letras o números ("-", ".", "ñ") es relleno. */
const MIN_NOTE_CHARACTERS = 3;

function meaningful(note: string): string | undefined {
  const text = note.trim().replace(/\s+/g, ' ');
  return (text.match(/[\p{L}\p{N}]/gu) ?? []).length >= MIN_NOTE_CHARACTERS ? text : undefined;
}

/** "Motivo (nota)", como lo exporta Tokko. Vacío o "-": "Otro". */
export function tokkoCloseReason(raw: string | undefined): TokkoCloseReason {
  const match = /^(.*?)\s*\(([\s\S]*)\)\s*$/.exec(raw ?? '');
  const name = (match ? match[1] : raw)?.trim() ?? '';
  const note = match?.[2] === undefined ? undefined : meaningful(match[2]);
  const key = normalizeName(name);
  const known = REASONS[key];
  const target = known ?? OTHER;
  const unknownName = known === undefined && meaningful(name) !== undefined ? name : undefined;
  const notes = [unknownName && `Motivo en Tokko: ${unknownName}`, note].filter(
    (part): part is string => Boolean(part),
  );
  const type: OpportunityType | undefined = key.startsWith('alquilo')
    ? 'rent'
    : key.startsWith('compro')
      ? 'sale'
      : target === APPRAISAL
        ? 'appraisal'
        : undefined;
  return { target, note: notes.length > 0 ? notes.join('. ') : undefined, type };
}

const ORIGINS: Readonly<Record<string, ContactChannel>> = {
  zonaprop: 'zonaprop',
  mercadolibre: 'mercadolibre',
  argenprop: 'argenprop',
  'sitio web': 'web_form',
  icasas: 'icasas',
  properati: 'properati',
  olx: 'olx',
  liderprop: 'liderprop',
  enbuenosaires: 'enbuenosaires',
  'reporte inmobiliario': 'reporte_inmobiliario',
};

/** El primero de los orígenes ("ZonaProp | mercadolibre"). Sin origen o desconocido: oficina. */
export function tokkoOrigin(raw: string | undefined): ContactChannel {
  const first = (raw ?? '').split('|')[0] ?? '';
  return ORIGINS[normalizeName(first)] ?? 'office';
}

/**
 * Tokko no exporta la operación: sale del motivo y, si no, de las etiquetas ("Tasacion",
 * "Alquiler" sin "Venta"). El resto es venta.
 */
export function tokkoOpportunityType(
  reason: TokkoCloseReason | undefined,
  tagNames: readonly string[],
): OpportunityType {
  if (reason?.type !== undefined) return reason.type;
  const tags = new Set(tagNames.map((tag) => normalizeName(tag)));
  if (tags.has('tasacion')) return 'appraisal';
  if (tags.has('alquiler') && !tags.has('venta')) return 'rent';
  return 'sale';
}
