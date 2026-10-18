import type { Result } from '../../../shared';
import type { PortalId } from '../../domain/portal';
import type { PortalUnavailableError } from './portal-authorizer';
import type { PortalCredentialsMissingError } from './portal-connector';

/**
 * Para qué sirve un paquete del portal: publicar avisos, destacarlos o publicar emprendimientos (en
 * MercadoLibre, `package_content`).
 */
export type PortalPackageContent = 'publications' | 'upgrades' | 'developments';

/** El cupo de un tipo de aviso dentro del paquete (en MercadoLibre, silver, gold o gold_premium). */
export interface PortalPackageQuota {
  readonly tier: string;
  readonly total: number;
  readonly used: number;
  readonly remaining: number;
}

/** Un paquete activo de la cuenta, con el cupo de cada tipo de aviso. */
export interface PortalPackage {
  readonly id: string;
  /** El nombre que le da el portal ("Paquete 15 Básico"). */
  readonly name: string;
  readonly content: PortalPackageContent;
  /** Cuándo vence el paquete, si el portal lo informa. */
  readonly expiresAt: Date | undefined;
  readonly quotas: readonly PortalPackageQuota[];
}

/** Los paquetes de publicación contratados en una cuenta conectada por OAuth (MercadoLibre). */
export interface PortalPackageReader {
  /** Los paquetes activos de la cuenta, leídos del portal en el momento. */
  packages(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
  }): Promise<
    Result<readonly PortalPackage[], PortalUnavailableError | PortalCredentialsMissingError>
  >;
}
