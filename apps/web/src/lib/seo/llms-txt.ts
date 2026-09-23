import { BUSINESS, type Business } from '../../constants/business';
import { absoluteUrl, routes } from './routes';

export interface LlmsTxtSource {
  readonly categories: readonly { readonly title: string; readonly slug: string }[];
  readonly posts: readonly {
    readonly title: string;
    readonly slug: string;
    readonly description: string | null;
  }[];
}

/**
 * `/llms.txt` (estándar emergente para que los motores de IA entiendan el sitio): qué es el
 * negocio, dónde opera, las páginas principales y las guías del blog.
 */
export function buildLlmsTxt(
  siteUrl: string,
  source: LlmsTxtSource,
  business: Business = BUSINESS,
): string {
  const url = (path: string) => absoluteUrl(siteUrl, path);
  const lines: string[] = [`# ${business.name}`, '', `> ${business.description}`, ''];

  if (business.areaServed.length > 0) {
    lines.push(`Zonas donde opera: ${business.areaServed.join(', ')}.`, '');
  }

  lines.push(
    '## Páginas principales',
    '',
    `- [Inicio](${url(routes.home())}): servicios de compra, venta, alquiler, tasaciones y administración de alquileres.`,
    `- [Blog](${url(routes.blog())}): guías sobre comprar, vender y alquilar propiedades.`,
    '',
  );

  if (source.categories.length > 0) {
    lines.push('## Temas del blog', '');
    for (const category of source.categories) {
      lines.push(`- [${category.title}](${url(routes.category(category.slug))})`);
    }
    lines.push('');
  }

  if (source.posts.length > 0) {
    lines.push('## Guías', '');
    for (const post of source.posts) {
      const description = post.description?.trim();
      lines.push(
        `- [${post.title}](${url(routes.post(post.slug))})${description ? `: ${description}` : ''}`,
      );
    }
    lines.push('');
  }

  const contact = [
    business.telephone && `- Teléfono: ${business.telephone}`,
    business.whatsapp && `- WhatsApp: https://wa.me/${business.whatsapp}`,
    business.email && `- Email: ${business.email}`,
    business.address &&
      `- Dirección: ${[
        business.address.streetAddress,
        business.address.addressLocality,
        business.address.addressRegion,
      ]
        .filter(Boolean)
        .join(', ')}`,
  ].filter((line): line is string => typeof line === 'string');
  if (contact.length > 0) lines.push('## Contacto', '', ...contact, '');

  return lines.join('\n');
}
