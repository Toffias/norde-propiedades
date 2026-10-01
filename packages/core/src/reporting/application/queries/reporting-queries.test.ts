import { describe, expect, it } from 'vitest';

import type { PropertyInterestProfile } from '../../../clients';
import { Actor } from '../../../shared';
import { FixedClock, unwrap, unwrapErr } from '../../../shared/testing';
import { InMemoryReportingProfiles, StubPropertyStatisticsQuery } from '../../testing';
import { lastMonths, monthOf, shiftMonth } from '../months';
import { GetOwnerReport } from './get-owner-report';
import { GetPropertyStatistics } from './get-property-statistics';

const PROPERTY = '00000000-0000-7000-8000-0000000000c1';
const READER = Actor.user('00000000-0000-7000-8000-0000000000a1', ['properties:read']);
const PROFILE: PropertyInterestProfile = {
  propertyId: PROPERTY,
  propertyType: 'apartment',
  operations: [],
  locationIds: [],
  rooms: undefined,
};

describe('months of Buenos Aires', () => {
  it('uses the local month at midnight UTC', () => {
    // 1 de octubre, 01:00 UTC: todavía es 30 de septiembre en Buenos Aires.
    expect(monthOf(new Date('2026-10-01T01:00:00Z'))).toBe('2026-09');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(lastMonths(new Date('2026-03-15T12:00:00Z'), 4)).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
  });
});

describe('GetPropertyStatistics', () => {
  it('fills every month of the chart and sums the totals', async () => {
    const statistics = new StubPropertyStatisticsQuery();
    statistics.monthlyRows = [
      { month: '2026-08', emailSends: 2, whatsappSends: 1, inquiries: 3 },
      { month: '2026-10', emailSends: 0, whatsappSends: 4, inquiries: 1 },
    ];
    statistics.interested = 7;
    statistics.tags = Array.from({ length: 12 }, (_, i) => ({
      tagId: `t${i.toString()}`,
      name: `Etiqueta ${i.toString()}`,
      clients: 12 - i,
    }));
    statistics.portals = [
      {
        portal: 'zonaprop',
        status: 'published',
        publishedAt: undefined,
        views: 120,
        contacts: 4,
        favorites: 9,
      },
      {
        portal: 'argenprop',
        status: 'paused',
        publishedAt: undefined,
        views: 0,
        contacts: 0,
        favorites: 0,
      },
    ];
    const result = unwrap(
      await new GetPropertyStatistics({
        profiles: new InMemoryReportingProfiles([PROFILE]),
        statistics,
        clock: new FixedClock('2026-10-15T12:00:00Z'),
      }).execute({ propertyId: PROPERTY, months: 3 }, READER),
    );
    expect(result.monthly).toEqual([
      { month: '2026-08', emailSends: 2, whatsappSends: 1, inquiries: 3 },
      { month: '2026-09', emailSends: 0, whatsappSends: 0, inquiries: 0 },
      { month: '2026-10', emailSends: 0, whatsappSends: 4, inquiries: 1 },
    ]);
    expect(result.totals).toEqual({
      emailSends: 2,
      whatsappSends: 5,
      interested: 7,
      inquiries: 4,
      activePublications: 1,
    });
    expect(result.interestedProfile).toHaveLength(10);
    expect(statistics.ranges[0]).toEqual({
      from: new Date('2026-08-01T03:00:00Z'),
      to: new Date('2026-11-01T03:00:00Z'),
    });
  });

  it('needs to see the property', async () => {
    const query = new GetPropertyStatistics({
      profiles: new InMemoryReportingProfiles([PROFILE]),
      statistics: new StubPropertyStatisticsQuery(),
      clock: new FixedClock(),
    });
    expect(unwrapErr(await query.execute({ propertyId: PROPERTY }, Actor.user('x', [])))).toEqual({
      type: 'Forbidden',
    });
    expect(
      unwrapErr(
        await query.execute({ propertyId: '00000000-0000-7000-8000-0000000000ff' }, READER),
      ),
    ).toEqual({ type: 'PropertyNotFound' });
  });
});

describe('GetOwnerReport', () => {
  it('reports the period of Buenos Aires, inclusive', async () => {
    const statistics = new StubPropertyStatisticsQuery();
    statistics.monthlyRows = [{ month: '2026-09', emailSends: 1, whatsappSends: 2, inquiries: 3 }];
    statistics.interested = 2;
    const report = unwrap(
      await new GetOwnerReport({
        profiles: new InMemoryReportingProfiles([PROFILE]),
        statistics,
      }).execute({ propertyId: PROPERTY, from: '2026-09-01', to: '2026-09-30' }, READER),
    );
    expect(report).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      publications: [],
      emailSends: 1,
      whatsappSends: 2,
      inquiries: 3,
      interested: 2,
    });
    expect(statistics.ranges[0]).toEqual({
      from: new Date('2026-09-01T03:00:00Z'),
      to: new Date('2026-10-01T03:00:00Z'),
    });
  });

  it('covers at most a year', async () => {
    const result = await new GetOwnerReport({
      profiles: new InMemoryReportingProfiles([PROFILE]),
      statistics: new StubPropertyStatisticsQuery(),
    }).execute({ propertyId: PROPERTY, from: '2025-01-01', to: '2026-09-30' }, READER);
    expect(unwrapErr(result)).toEqual({ type: 'ReportPeriodTooLong', maxDays: 366 });
  });
});
