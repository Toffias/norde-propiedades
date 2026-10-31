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
  /** Cómo se muestra el teléfono (`+54 9 11 2500-4138`). Sin él, se muestra el E.164. */
  readonly telephoneLabel: string | null;
  /** Solo dígitos (E.164 sin `+`), para los links de WhatsApp. */
  readonly whatsapp: string | null;
  readonly address: BusinessAddress | null;
  readonly geo: { readonly latitude: number; readonly longitude: number } | null;
  /** Horario en formato schema.org (`Mo-Fr 09:00-18:00`). La barra superior lo muestra en texto. */
  readonly openingHours: readonly string[];
  /** Zonas donde opera (JSON-LD `areaServed` y `llms.txt`). */
  readonly areaServed: readonly string[];
  /**
   * Perfiles externos que confirman la identidad de la marca (redes, portales, Google Business).
   * Las redes conocidas (Facebook, Instagram, LinkedIn, YouTube) aparecen en la barra superior.
   */
  readonly sameAs: readonly string[];
}

export const BUSINESS: Business = {
  name: 'Norde Propiedades',
  legalName: 'Norde Propiedades',
  description:
    'Inmobiliaria: compra, venta y alquiler de propiedades, tasaciones y administración de alquileres, con atención personalizada.',
  tagline: 'Compra, venta y alquiler de propiedades',
  // Datos de contacto tomados de nordepropiedades.com.ar (el sitio actual, en Tokko).
  email: 'contacto@nordepropiedades.com.ar',
  telephone: '+541146871674',
  telephoneLabel: '(011) 4687-1674',
  whatsapp: '5491161798942',
  address: {
    streetAddress: 'Av. Emilio Castro 7250',
    addressLocality: 'Mataderos',
    addressRegion: 'Ciudad Autónoma de Buenos Aires',
    postalCode: null,
    addressCountry: 'AR',
  },
  // La puerta de Av. Emilio Castro 7250 en OpenStreetMap (nodo 4267243788).
  geo: { latitude: -34.6539488, longitude: -58.5194518 },
  openingHours: [],
  areaServed: [],
  sameAs: [
    'https://www.facebook.com/profile.php?id=100087943220522',
    'https://www.instagram.com/nordepropiedades_',
  ],
};

/** Título por defecto: la home y las páginas sin meta title. */
export const SITE_TITLE = `${BUSINESS.name} | ${BUSINESS.tagline}`;
