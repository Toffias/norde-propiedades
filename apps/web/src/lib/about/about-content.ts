import { BUSINESS } from '../../constants/business';
import type { AboutPage, Media, TeamMember } from '../../payload-types';

// Lo que la página de Nosotros y contacto muestra, armado desde Payload. Funciones puras: las
// lecturas cacheadas están en `queries.ts`.

/** Presentación por defecto, mientras Norde no cargue la suya. */
export const DEFAULT_ABOUT_INTRO =
  'Una inmobiliaria de barrio, en la esquina de siempre. Te acompañamos a comprar, vender, alquilar o tasar, con atención personalizada.';

export interface Milestone {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly text: string;
  readonly image: Media | null;
}

export interface AboutStat {
  readonly id: string;
  readonly value: number;
  readonly prefix: string;
  readonly suffix: string;
  readonly label: string;
}

export interface AboutContent {
  readonly intro: string;
  readonly milestones: readonly Milestone[];
  readonly stats: readonly AboutStat[];
}

export interface TeamMemberCard {
  readonly id: number;
  readonly name: string;
  readonly role: string;
  readonly area: string | null;
  readonly license: string | null;
  readonly photo: Media | null;
  /** Solo dígitos, para `wa.me`: el de la persona o, si no tiene, el de la inmobiliaria. */
  readonly whatsapp: string | null;
}

const asMedia = (value: number | Media | null | undefined): Media | null =>
  value !== null && typeof value === 'object' ? value : null;

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
};

export function toAboutContent(page: AboutPage | null): AboutContent {
  return {
    intro: clean(page?.intro) ?? DEFAULT_ABOUT_INTRO,
    milestones: (page?.milestones ?? []).map((m, index) => ({
      id: m.id ?? String(index),
      label: m.label.trim(),
      title: m.title.trim(),
      text: m.text.trim(),
      image: asMedia(m.image),
    })),
    stats: (page?.stats ?? []).map((s, index) => ({
      id: s.id ?? String(index),
      value: s.value,
      prefix: clean(s.prefix) ?? '',
      suffix: clean(s.suffix) ?? '',
      label: s.label.trim(),
    })),
  };
}

export function toTeamMemberCard(
  member: Pick<TeamMember, 'id' | 'name' | 'role' | 'area' | 'license' | 'photo' | 'whatsapp'>,
  fallbackWhatsapp: string | null = BUSINESS.whatsapp,
): TeamMemberCard {
  return {
    id: member.id,
    name: member.name.trim(),
    role: member.role.trim(),
    area: clean(member.area),
    license: clean(member.license),
    photo: asMedia(member.photo),
    whatsapp: clean(member.whatsapp) ?? fallbackWhatsapp,
  };
}

/** Cómo se lee una cifra (`+15`, `98%`), igual en el HTML inicial y al terminar la animación. */
export function formatStat(stat: Pick<AboutStat, 'value' | 'prefix' | 'suffix'>): string {
  return `${stat.prefix}${stat.value.toLocaleString('es-AR')}${stat.suffix}`;
}
