import type { PropertyByCode, PropertyCodeLookup } from '@norde/core/portals';
import { MAX_PROPERTY_CODES, type PanelPropertyRow } from '@norde/core/properties/contracts';
import type { Actor, Result } from '@norde/core/shared';

import { chunk } from './chunk';

// Busca propiedades por código de referencia con la API pública de properties, para emparejar los
// avisos de un portal. Vive en el panel porque compone módulos.

interface FindByCode {
  execute(
    input: { readonly codes: readonly string[] },
    actor: Actor,
  ): Promise<Result<readonly PanelPropertyRow[], { readonly type: string }>>;
}

export function propertyCodeLookup(deps: {
  readonly findByCode: FindByCode;
  readonly actor: Actor;
}): PropertyCodeLookup {
  return {
    async byCodes(codes: readonly string[]): Promise<readonly PropertyByCode[]> {
      const found: PanelPropertyRow[] = [];
      // La búsqueda acepta hasta MAX_PROPERTY_CODES códigos: una página de avisos aporta el doble
      // (clave interna y código de cada uno), así que se busca en lotes.
      for (const batch of chunk([...new Set(codes)], MAX_PROPERTY_CODES)) {
        const rows = await deps.findByCode.execute({ codes: batch }, deps.actor);
        // Lo único esperable es un permiso mal armado en el container: es un error de programación.
        if (rows.isErr()) throw new Error(`Property lookup by code failed: ${rows.error.type}`);
        found.push(...rows.value);
      }
      return found.map((row) => ({
        propertyId: row.id,
        code: row.code,
        title: row.portalTitle,
        developmentId: row.developmentId,
      }));
    },
  };
}
