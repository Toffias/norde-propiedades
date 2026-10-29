import type { Metadata } from 'next';

import { AboutHero } from '../../../components/about/about-hero';
import { AboutStats } from '../../../components/about/about-stats';
import { ContactSection } from '../../../components/about/contact-section';
import { HistoryTimeline } from '../../../components/about/history-timeline';
import { TeamSection } from '../../../components/about/team-section';
import { JsonLdScript } from '../../../components/seo/json-ld-script';
import { getContainer } from '../../../container';
import { findAboutContent, listTeamMembers } from '../../../lib/about/queries';
import { mediaAbsoluteUrl } from '../../../lib/blog/media';
import { breadcrumbSchema, teamSchema } from '../../../lib/seo/json-ld';
import { buildMetadata, withBrand } from '../../../lib/seo/metadata';
import { routes } from '../../../lib/seo/routes';
import { getSiteUrl } from '../../../lib/site-url';

// Por request: el formulario depende de la configuración del entorno (el build corre sin ella).
export const dynamic = 'force-dynamic';

const DESCRIPTION =
  'Conocé la historia y el equipo de Norde Propiedades, y escribinos para comprar, vender, alquilar o tasar tu propiedad.';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: withBrand('Nosotros y contacto'),
    description: DESCRIPTION,
    path: routes.contact(),
  });
}

/** Nosotros y contacto: la historia de Norde, el equipo y, al final, cómo escribirnos. */
export default async function ContactPage() {
  const formEnabled = getContainer().inquiries !== undefined;
  const [about, team] = await Promise.all([findAboutContent(), listTeamMembers()]);
  const siteUrl = getSiteUrl();

  return (
    <div className="space-y-16 pb-4 sm:space-y-20">
      {/* Sin migas visibles: la portada ocupa la pantalla. Quedan para los buscadores. */}
      <JsonLdScript
        data={breadcrumbSchema(siteUrl, [
          { name: 'Inicio', path: routes.home() },
          { name: 'Nosotros y contacto', path: routes.contact() },
        ])}
      />
      <AboutHero intro={about.intro} />

      <HistoryTimeline milestones={about.milestones} />
      <AboutStats stats={about.stats} />

      {team.length > 0 && (
        <JsonLdScript
          data={teamSchema(
            siteUrl,
            team.map((member) => ({
              name: member.name,
              jobTitle: member.role,
              imageUrl: mediaAbsoluteUrl(member.photo, siteUrl),
            })),
          )}
        />
      )}
      <TeamSection members={team} />

      <ContactSection formEnabled={formEnabled} />
    </div>
  );
}
