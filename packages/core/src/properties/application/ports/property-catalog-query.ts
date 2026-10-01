import type { PageSlice } from '../../../shared';
import type {
  FavoriteSearchRow,
  FeatureKindValue,
  FeatureRow,
  LocationKindValue,
  LocationRow,
  TagGroupRow,
  TagRow,
} from '../../contracts';
import type { GridColumn } from '../../domain/grid-columns';
import type { PropertyTypeSetting } from '../../domain/property-type-settings';

interface Paging {
  readonly offset: number;
  readonly limit: number;
}

type Direction = 'asc' | 'desc';

/** Lecturas paginadas de los catálogos y la configuración de propiedades. SQL en infra. */
export interface PropertyCatalogQuery {
  searchLocations(
    criteria: Paging & {
      readonly text: string | undefined;
      readonly parentId: string | undefined;
      readonly kind: LocationKindValue | undefined;
      readonly direction: Direction;
    },
  ): Promise<PageSlice<LocationRow>>;

  listFeatures(
    criteria: Paging & {
      readonly kind: FeatureKindValue;
      readonly text: string | undefined;
      readonly active: boolean | undefined;
      readonly sort: { readonly field: 'position' | 'name'; readonly direction: Direction };
    },
  ): Promise<PageSlice<FeatureRow>>;

  listTagGroups(
    criteria: Paging & {
      readonly text: string | undefined;
      readonly sort: { readonly field: 'position' | 'name'; readonly direction: Direction };
    },
  ): Promise<PageSlice<TagGroupRow>>;

  searchTags(
    criteria: Paging & {
      readonly text: string | undefined;
      /** `null`: las etiquetas sin grupo. */
      readonly groupId: string | null | undefined;
      readonly direction: Direction;
    },
  ): Promise<PageSlice<TagRow>>;

  listFavoriteSearches(
    criteria: Paging & {
      readonly userId: string;
      readonly sort: { readonly field: 'name' | 'updatedAt'; readonly direction: Direction };
    },
  ): Promise<PageSlice<FavoriteSearchRow>>;

  /** Los ocho tipos; los que no tienen configuración guardada, con la recomendada. */
  typeSettings(): Promise<readonly PropertyTypeSetting[]>;

  gridColumns(): Promise<readonly GridColumn[]>;
}
