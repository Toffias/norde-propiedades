import { isActiveSubItem } from '@norde/ui/components/nav-list';
import { describe, expect, it } from 'vitest';

import {
  COMPANY_GROUPS,
  COMPANY_NAV_ITEMS,
  currentCompanyGroup,
  visibleSections,
} from './company-navigation';

const ALL_OFF = {
  watermark: false,
  referenceCodes: false,
  teams: false,
  customAttributes: false,
} as const;

describe('company navigation', () => {
  it('never hides the first section of a group, where its submenu item leads', () => {
    for (const group of COMPANY_GROUPS) {
      expect(group.sections[0].feature).toBeUndefined();
      expect(visibleSections(group, ALL_OFF)[0]).toBe(group.sections[0]);
    }
  });

  it('finds the group of a section and of the routes under it', () => {
    expect(currentCompanyGroup('/mi-empresa/roles')?.label).toBe('Equipo');
    expect(currentCompanyGroup('/mi-empresa/etiquetas/grupos')?.label).toBe('Catálogos');
    expect(currentCompanyGroup('/mi-empresa/archivos/papelera')?.label).toBe('Archivos');
    expect(currentCompanyGroup('/oportunidades')).toBeUndefined();
  });

  it('marks the submenu item of the group as active on any of its sections', () => {
    const active = COMPANY_NAV_ITEMS.filter((item) =>
      isActiveSubItem('/mi-empresa/sucursales', item),
    );
    expect(active.map((item) => item.label)).toEqual(['Equipo']);
  });

  it('hides sections whose feature is off', () => {
    const general = COMPANY_GROUPS.find((group) => group.label === 'General');
    expect(general && visibleSections(general, ALL_OFF).map((s) => s.label)).toEqual([
      'Datos',
      'Email',
    ]);
  });
});
