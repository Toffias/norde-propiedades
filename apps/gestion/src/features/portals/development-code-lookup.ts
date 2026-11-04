import type { DevelopmentByCode, DevelopmentCodeLookup } from '@norde/core/portals';
import type { DevelopmentByCodeRow } from '@norde/core/properties';
import { MAX_DEVELOPMENT_CODES } from '@norde/core/properties/contracts';
import type { Actor, Result } from '@norde/core/shared';

import { chunk } from './chunk';

// Busca emprendimientos por código con la API pública de properties, para emparejar los
// emprendimientos de un portal. Vive en el panel porque compone módulos.

interface FindByCode {
  execute(
    input: { readonly codes: readonly string[] },
    actor: Actor,
  ): Promise<Result<readonly DevelopmentByCodeRow[], { readonly type: string }>>;
}

export function developmentCodeLookup(deps: {
  readonly findByCode: FindByCode;
  readonly actor: Actor;
}): DevelopmentCodeLookup {
  return {
    async byCodes(codes: readonly string[]): Promise<readonly DevelopmentByCode[]> {
      const found: DevelopmentByCodeRow[] = [];
      // La búsqueda acepta hasta MAX_DEVELOPMENT_CODES códigos por vez: se busca en lotes.
      for (const batch of chunk([...new Set(codes)], MAX_DEVELOPMENT_CODES)) {
        const rows = await deps.findByCode.execute({ codes: batch }, deps.actor);
        // Lo único esperable es un permiso mal armado en el container: es un error de programación.
        if (rows.isErr()) throw new Error(`Development lookup by code failed: ${rows.error.type}`);
        found.push(...rows.value);
      }
      return found.map((row) => ({ developmentId: row.id, code: row.code, name: row.name }));
    },
  };
}
