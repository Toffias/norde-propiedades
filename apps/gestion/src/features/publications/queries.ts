import 'server-only';

import type { ListPortalPublicationsQuery } from '@norde/core/reporting/contracts';

import { getContainer } from '../../container';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';

import {
  PORTAL_PUBLICATIONS_ERROR_MESSAGES,
  PUBLICATION_OVERVIEW_ERROR_MESSAGES,
} from './messages';

// Lecturas de Difusión (#114) para los Server Components. La autorización la decide el caso de
// uso; sin la difusión en portales prendida (`PORTALS_ENABLED`), la sección no existe.

export async function loadPublicationOverview() {
  const container = getContainer();
  if (!container.portals) return { kind: 'hidden' as const };
  const { actor } = await requireSession();
  const result = await container.reporting.getPublicationOverview.execute({}, actor);
  return result.isOk()
    ? { kind: 'ok' as const, overview: result.value }
    : {
        kind: 'error' as const,
        message: messageForError(result.error, PUBLICATION_OVERVIEW_ERROR_MESSAGES),
      };
}

export async function loadPortalPublications(query: ListPortalPublicationsQuery) {
  const container = getContainer();
  if (!container.portals) return { kind: 'hidden' as const };
  const { actor } = await requireSession();
  const result = await container.reporting.listPortalPublications.execute(query, actor);
  return result.isOk()
    ? { kind: 'ok' as const, page: result.value }
    : {
        kind: 'error' as const,
        message: messageForError(result.error, PORTAL_PUBLICATIONS_ERROR_MESSAGES),
      };
}
