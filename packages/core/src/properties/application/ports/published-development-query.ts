import type { PageSlice } from '../../../shared';
import type {
  ConstructionStatusValue,
  DevelopmentType,
  PublicDevelopmentSort,
} from '../../contracts';
import type { DevelopmentStatus } from '../../domain/development';
import type { FeatureKind } from '../../domain/feature';
import type { PropertyStatus } from '../../domain/property-status';
import type { LocationLevel, UnitPriceFrom } from '../../domain/public-development';

import type { PropertyMediaRecord } from './property-search-query';

/**
 * Fila de lectura de un emprendimiento para la web, con lo necesario para decidir qué se publica
 * (`public-development.ts`). No trae los datos privados: dirección exacta, desarrollista ni
 * contacto comercial.
 */
export interface PublishedDevelopmentRecord {
  readonly id: string;
  readonly code: string;
  readonly slug: string;
  readonly name: string;
  readonly developmentType: DevelopmentType | null;
  readonly status: DevelopmentStatus;
  readonly constructionStatus: ConstructionStatusValue | null;
  readonly deliveryDate: string | null;
  readonly publishAddress: string | null;
  /** Del país al nivel elegido. */
  readonly locationPath: readonly LocationLevel[];
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly description: string;
  readonly financingDetails: string | null;
  readonly isFinanced: boolean;
  readonly acceptsSwap: boolean;
  readonly immediateDeed: boolean;
  /** Características activas del catálogo, en su orden. */
  readonly features: readonly { readonly kind: FeatureKind; readonly name: string }[];
  /** En el orden de la galería; la portada primero. */
  readonly media: readonly PropertyMediaRecord[];
  /** Unidades que se muestran al público (los estados de `unitStatuses`, publicadas en la web). */
  readonly listedUnitCount: number;
  /** El menor precio de venta visible de esas unidades, uno por moneda. */
  readonly unitPricesFrom: readonly UnitPriceFrom[];
  readonly deletedAt: Date | null;
  readonly updatedAt: Date;
}

export interface PublishedDevelopmentCriteria {
  /** Qué estados del emprendimiento son públicos: lo decide el dominio. */
  readonly statuses: readonly DevelopmentStatus[];
  /** Qué estados de las unidades se cuentan y cotizan: lo decide el dominio. */
  readonly unitStatuses: readonly PropertyStatus[];
  readonly developmentType?: DevelopmentType | undefined;
  readonly constructionStatus?: ConstructionStatusValue | undefined;
  readonly sort: PublicDevelopmentSort;
  readonly offset: number;
  readonly limit: number;
}

/**
 * Puerto de lectura de emprendimientos para la web (CQRS liviano): infra lo implementa con SQL
 * paginado. Los de la papelera nunca salen del listado.
 */
export interface PublishedDevelopmentQuery {
  search(criteria: PublishedDevelopmentCriteria): Promise<PageSlice<PublishedDevelopmentRecord>>;
  /** También los ocultos y los de la papelera: la ficha distingue "no existe" de "ya no se ofrece". */
  findBySlug(
    slug: string,
    unitStatuses: readonly PropertyStatus[],
  ): Promise<PublishedDevelopmentRecord | undefined>;
  /** El emprendimiento dueño de una foto o un plano de su galería (la ruta pública de fotos). */
  findByMediaId(
    mediaId: string,
    unitStatuses: readonly PropertyStatus[],
  ): Promise<PublishedDevelopmentRecord | undefined>;
}
