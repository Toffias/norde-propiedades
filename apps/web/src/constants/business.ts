/**
 * Datos del negocio: fuente única para la metadata, el JSON-LD, `llms.txt`, el header y el footer.
 *
 * Los datos de contacto que Norde todavía no confirmó quedan en `null` (ver las preguntas abiertas
 * de docs/modulos/02-web-diseno-seo.md). Un dato en `null` no se muestra ni se publica en el
 * JSON-LD: es preferible omitirlo a informar un teléfono o una dirección equivocados.
 */

export interface BusinessAddress {
  readonly streetAddress: string | null;
  readonly addressLocality: string;
  readonly addressRegion: string;
  readonly postalCode: string | null;
  readonly addressCountry: 'AR';
}

export interface Business {
  readonly name: string;
  readonly legalName: string;
  /** Descripción corta (idealmente 120 a 160 caracteres): meta description por defecto. */
  readonly description: string;
  /** Frase de marca para el título de la home. */
  readonly tagline: string;
  readonly email: string | null;
  /** E.164, para `tel:` y el JSON-LD. */
  readonly telephone: string | null;
  /** Solo dígitos (E.164 sin `+`), para los links de WhatsApp. */
  readonly whatsapp: string | null;
  readonly address: BusinessAddress | null;
  readonly geo: { readonly latitude: number; readonly longitude: number } | null;
  /** Horario en formato schema.org (`Mo-Fr 09:00-18:00`). */
  readonly openingHours: readonly string[];
  /** Zonas donde opera (JSON-LD `areaServed` y `llms.txt`). */
  readonly areaServed: readonly string[];
  /** Perfiles externos que confirman la identidad de la marca (redes, portales, Google Business). */
  readonly sameAs: readonly string[];
}

export const BUSINESS: Business = {
  name: 'Norde Propiedades',
  legalName: 'Norde Propiedades',
  description:
    'Inmobiliaria: compra, venta y alquiler de propiedades, tasaciones y administración de alquileres, con atención personalizada.',
  tagline: 'Compra, venta y alquiler de propiedades',
  email: null,
  telephone: null,
  whatsapp: null,
  address: null,
  geo: null,
  openingHours: [],
  areaServed: [],
  sameAs: [],
};

/** Título por defecto: la home y las páginas sin meta title. */
export const SITE_TITLE = `${BUSINESS.name} | ${BUSINESS.tagline}`;
