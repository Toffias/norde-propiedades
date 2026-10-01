// Fakes del módulo reporting para tests (`@norde/core/reporting/testing`).

import type { PropertyInterestProfile } from '../../clients';
import type { Actor } from '../../shared';
import type { PortalPublicationStats } from '../contracts';
import type { ReportingPropertyProfiles } from '../application/ports/property-profiles';
import type {
  PropertyStatisticsQuery,
  StatisticsRange,
} from '../application/ports/property-statistics-query';

export class InMemoryReportingProfiles implements ReportingPropertyProfiles {
  constructor(private readonly profiles: readonly PropertyInterestProfile[] = []) {}

  find(propertyId: string, actor: Actor) {
    if (!actor.can('properties:read')) return Promise.resolve(undefined);
    return Promise.resolve(this.profiles.find((profile) => profile.propertyId === propertyId));
  }
}

/** Devuelve lo configurado y registra los rangos pedidos. */
export class StubPropertyStatisticsQuery implements PropertyStatisticsQuery {
  readonly ranges: StatisticsRange[] = [];
  monthlyRows: {
    month: string;
    emailSends: number;
    whatsappSends: number;
    inquiries: number;
  }[] = [];
  interested = 0;
  tags: { tagId: string; name: string; clients: number }[] = [];
  portals: PortalPublicationStats[] = [];

  monthly(_propertyId: string, range: StatisticsRange) {
    this.ranges.push(range);
    return Promise.resolve(this.monthlyRows);
  }

  interestedCount() {
    return Promise.resolve(this.interested);
  }

  interestedTags(_profile: PropertyInterestProfile, limit: number) {
    return Promise.resolve(this.tags.slice(0, limit));
  }

  publications() {
    return Promise.resolve(this.portals);
  }
}
