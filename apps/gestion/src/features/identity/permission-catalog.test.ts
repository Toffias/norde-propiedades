import { PERMISSION_CATALOG } from '@norde/core/identity';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompanyFeatures } from '../../config/env';
import { visiblePermissionCatalog } from './permission-catalog';

vi.mock('server-only', () => ({}));

const features: { current: CompanyFeatures; portals: boolean } = {
  current: { watermark: false, referenceCodes: false, teams: false, customAttributes: false },
  portals: false,
};
vi.mock('../../config/env', () => ({
  companyFeatures: () => features.current,
  portalsEnabled: () => features.portals,
}));

function resources(): string[] {
  return visiblePermissionCatalog().flatMap((group) => group.resources.map((r) => r.resource));
}

describe('visiblePermissionCatalog', () => {
  beforeEach(() => {
    features.current = { ...features.current, teams: false };
    features.portals = false;
  });

  it('hides the teams permissions while teams are off', () => {
    expect(resources()).not.toContain('teams');
    expect(resources()).toContain('branches');
  });

  it('hides the portals permissions while portals are off', () => {
    expect(resources()).not.toContain('portals');
    expect(resources()).toContain('inquiries');
  });

  it('offers the whole catalog with teams and portals on', () => {
    features.current = { ...features.current, teams: true };
    features.portals = true;
    expect(visiblePermissionCatalog()).toBe(PERMISSION_CATALOG);
  });
});
