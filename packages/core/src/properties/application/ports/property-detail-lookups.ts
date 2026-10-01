import type { PanelPropertyCustomAttribute, PropertyLocationLevel } from '../../contracts';

/**
 * Lo que la ficha muestra además del aggregate: nombres de los catálogos, propietarios, portada y
 * cantidades. Cada lista está acotada (la de una sola propiedad).
 */
export interface PropertyDetailLookups {
  /** La ubicación y sus ancestros, de la raíz hacia abajo. */
  locationPath(locationId: string): Promise<readonly PropertyLocationLevel[]>;
  features(
    ids: readonly string[],
  ): Promise<readonly { readonly id: string; readonly kind: string; readonly name: string }[]>;
  tags(ids: readonly string[]): Promise<
    readonly {
      readonly id: string;
      readonly name: string;
      readonly groupName: string | undefined;
    }[]
  >;
  /** Las definiciones activas y las de estos IDs (inactivas con valor), sin el valor. */
  customAttributes(
    withValues: readonly string[],
  ): Promise<readonly Omit<PanelPropertyCustomAttribute, 'value'>[]>;
  /** Propietarios: clientes por ID, con su nombre para mostrar. */
  owners(propertyId: string): Promise<readonly { readonly id: string; readonly name: string }[]>;
  cover(
    propertyId: string,
  ): Promise<{ readonly mediaId: string; readonly hasThumbnail: boolean } | undefined>;
  counts(propertyId: string): Promise<{ readonly media: number; readonly attachments: number }>;
  /** Quién dio el alta (`created_by`). */
  createdBy(propertyId: string): Promise<string | undefined>;
}
