import 'server-only';

import config from '@payload-config';
import { unstable_cache } from 'next/cache';
import { getPayload } from 'payload';

import { BLOG_CACHE_TAG, BLOG_REVALIDATE_SECONDS } from '../blog/cache';
import {
  toAboutContent,
  toTeamMemberCard,
  type AboutContent,
  type TeamMemberCard,
} from './about-content';

// Lecturas de Nosotros con la Local API de Payload, cacheadas con el tag del contenido editorial
// (lo invalidan los hooks de la colección del equipo y del global).

const CACHE_OPTIONS = { tags: [BLOG_CACHE_TAG], revalidate: BLOG_REVALIDATE_SECONDS };

/** El equipo entra en una sola pantalla: más integrantes no se muestran. */
export const MAX_TEAM_MEMBERS = 24;

const payload = () => getPayload({ config });

export const findAboutContent = unstable_cache(
  async (): Promise<AboutContent> => {
    const page = await (
      await payload()
    ).findGlobal({ slug: 'about-page', depth: 1, overrideAccess: false });
    return toAboutContent(page);
  },
  ['about:content'],
  CACHE_OPTIONS,
);

export const listTeamMembers = unstable_cache(
  async (): Promise<TeamMemberCard[]> => {
    const result = await (
      await payload()
    ).find({
      collection: 'team-members',
      overrideAccess: false,
      depth: 1,
      limit: MAX_TEAM_MEMBERS,
      sort: ['order', 'name'],
      where: { active: { equals: true } },
      select: { name: true, role: true, area: true, license: true, photo: true, whatsapp: true },
    });
    return result.docs.map((member) => toTeamMemberCard(member));
  },
  ['about:team'],
  CACHE_OPTIONS,
);
