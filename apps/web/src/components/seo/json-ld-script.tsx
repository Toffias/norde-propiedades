import { serializeJsonLd, type JsonLd } from '../../lib/seo/json-ld';

/** Datos estructurados en el HTML inicial (legibles por buscadores y crawlers de IA). */
export function JsonLdScript({ data }: { readonly data: JsonLd | readonly JsonLd[] }) {
  return (
    <script
      type="application/ld+json"
      // Contenido propio serializado con `<` escapado (ver serializeJsonLd).
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
