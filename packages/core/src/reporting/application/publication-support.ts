import type { Actor } from '../../shared';
import {
  PUBLISHABLE_DEVELOPMENT_STATUS,
  PUBLISHABLE_PROPERTY_STATUS,
} from '../domain/publication-buckets';
import type { PublishableStatuses } from './ports/publication-overview-query';

/** Difusión la ve quien publica o administra los portales. */
export function canSeePublications(actor: Actor): boolean {
  return actor.can('portals:publish') || actor.can('portals:manage');
}

export const PUBLISHABLE: PublishableStatuses = {
  property: PUBLISHABLE_PROPERTY_STATUS,
  development: PUBLISHABLE_DEVELOPMENT_STATUS,
};
