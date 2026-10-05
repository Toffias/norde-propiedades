import { NEWS_KIND_VALUES, type NewsKindValue } from '@norde/core/audit/contracts';

// Qué tipos de noticia ve cada usuario. Es una preferencia de pantalla, no un dato: va en una cookie
// para que el servidor pinte el feed ya filtrado.

export const NEWS_KINDS_COOKIE = 'norde-news-kinds';
/** Valor de la cookie cuando no se eligió ningún tipo (sin cookie, se ven todos). */
const NO_KINDS = 'none';

export const NEWS_KIND_GROUPS: readonly {
  readonly label: string;
  readonly kinds: readonly { readonly kind: NewsKindValue; readonly label: string }[];
}[] = [
  {
    label: 'Contactos',
    kinds: [
      { kind: 'client.created', label: 'Contactos nuevos' },
      { kind: 'client.reassigned', label: 'Contactos reasignados' },
      { kind: 'client.deleted', label: 'Contactos borrados' },
    ],
  },
  {
    label: 'Propiedades',
    kinds: [
      { kind: 'property.created', label: 'Nuevas propiedades' },
      { kind: 'property.status_changed', label: 'Cambios de estado' },
      { kind: 'property.operation_changed', label: 'Cambios de operación' },
      { kind: 'property.price_changed', label: 'Cambios de precio' },
      { kind: 'property.reservation', label: 'Reservas' },
    ],
  },
];

/** La cookie es editable a mano: se quedan solo los tipos conocidos, en su orden. */
export function parseNewsKinds(value: string | undefined): NewsKindValue[] {
  if (value === undefined || value === '') return [...NEWS_KIND_VALUES];
  if (value === NO_KINDS) return [];
  const chosen = value.split(',');
  return NEWS_KIND_VALUES.filter((kind) => chosen.includes(kind));
}

export function serializeNewsKinds(kinds: readonly NewsKindValue[]): string {
  return kinds.length === 0 ? NO_KINDS : kinds.join(',');
}
