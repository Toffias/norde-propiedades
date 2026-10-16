import type { PropertyByCode, PropertyCodeLookup } from '@norde/core/portals';
import type { PanelPropertyRow } from '@norde/core/properties/contracts';
import type { Actor, Result } from '@norde/core/shared';

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
      if (codes.length === 0) return [];
      const rows = await deps.findByCode.execute({ codes: [...new Set(codes)] }, deps.actor);
      // Lo único esperable es un permiso mal armado en el container: es un error de programación.
      if (rows.isErr()) throw new Error(`Property lookup by code failed: ${rows.error.type}`);
      return rows.value.map((row) => ({
        propertyId: row.id,
        code: row.code,
        title: row.portalTitle,
        developmentId: row.developmentId,
      }));
    },
  };
}
