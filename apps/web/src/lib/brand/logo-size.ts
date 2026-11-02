// El alto del logo de Mi empresa en el header y el footer, armado desde el global "Apariencia"
// de Payload. Funciones puras: la lectura cacheada está en `logo-size-query.ts`.

/**
 * Límites en píxeles. El máximo del header deja aire dentro de la barra (80 px de alto en
 * computadora, 64 en el celular). Los valores por defecto son los de antes del ajuste.
 */
export const LOGO_HEIGHT_LIMITS = {
  header: { min: 24, max: 72, default: 48 },
  footer: { min: 32, max: 120, default: 56 },
} as const;

/** En el celular el header es más bajo: el logo se achica en la misma proporción (64 / 80). */
const MOBILE_HEADER_RATIO = 0.8;

export interface LogoSizes {
  readonly header: { readonly desktop: number; readonly mobile: number };
  readonly footer: number;
}

interface LogoSizeSettings {
  readonly headerLogoHeight?: number | null;
  readonly footerLogoHeight?: number | null;
}

const toHeight = (
  value: number | null | undefined,
  limits: { readonly min: number; readonly max: number; readonly default: number },
): number => {
  if (value === null || value === undefined || !Number.isFinite(value)) return limits.default;
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
};

export function toLogoSizes(settings: LogoSizeSettings | null): LogoSizes {
  const desktop = toHeight(settings?.headerLogoHeight, LOGO_HEIGHT_LIMITS.header);
  return {
    header: { desktop, mobile: Math.round(desktop * MOBILE_HEADER_RATIO) },
    footer: toHeight(settings?.footerLogoHeight, LOGO_HEIGHT_LIMITS.footer),
  };
}
