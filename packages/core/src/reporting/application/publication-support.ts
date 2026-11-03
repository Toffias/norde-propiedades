import { canSeePortals } from '../../portals';
import type { Actor } from '../../shared';
import {
  PUBLISHABLE_DEVELOPMENT_STATUS,
  PUBLISHABLE_PROPERTY_STATUS,
} from '../domain/publication-buckets';
import type { PublishableStatuses } from './ports/publication-overview-query';

/** Difusión la ve quien puede ver los portales: quien solo mira, publica o los administra. */
export function canSeePublications(actor: Actor): boolean {
  return canSeePortals(actor);
}

export const PUBLISHABLE: PublishableStatuses = {
  property: PUBLISHABLE_PROPERTY_STATUS,
  development: PUBLISHABLE_DEVELOPMENT_STATUS,
};
