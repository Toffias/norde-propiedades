import 'server-only';

import { PERMISSION_CATALOG, type PermissionGroup } from '@norde/core/identity';

import { companyFeatures } from '../../config/env';

/**
 * El catálogo que se ofrece en Roles y Usuarios, sin los recursos de funciones ocultas (#50). Solo
 * se dejan de mostrar: un rol conserva los permisos que ya tenía, porque el formulario los mantiene.
 */
export function visiblePermissionCatalog(): readonly PermissionGroup[] {
  const hidden = new Set<string>(companyFeatures().teams ? [] : ['teams']);
  if (hidden.size === 0) return PERMISSION_CATALOG;
  return PERMISSION_CATALOG.map((group) => ({
    ...group,
    resources: group.resources.filter((resource) => !hidden.has(resource.resource)),
  })).filter((group) => group.resources.length > 0);
}
