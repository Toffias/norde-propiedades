import type { OwnerReport } from '../../../reporting';
import type { Actor, PageSlice } from '../../../shared';
import type { PanelPropertyDetail, PropertyDocumentRow } from '../../contracts';
import type { DocumentContact } from './document-contacts';
import type {
  PdfAddressDisplay,
  PdfPrice,
  PropertyDocumentKind,
  ReportPeriod,
} from '../../domain/property-document';

/** Lo que imprime el PDF, ya resuelto por el caso de uso (dirección y precios según las reglas). */
export interface PropertyDocumentContent {
  readonly kind: PropertyDocumentKind;
  readonly property: PanelPropertyDetail;
  readonly address: string;
  readonly prices: readonly PdfPrice[];
  /** Fotos para el PDF (versión web, con marca de agua si está activa), en orden. */
  readonly photos: readonly Uint8Array[];
  readonly company: { readonly name: string; readonly logo: Uint8Array | undefined };
  /** El agente que lo pidió, con su teléfono y email, si la configuración lo muestra. */
  readonly agent: DocumentContact | undefined;
  /** La sucursal de la propiedad (o la casa central): el contacto del pie. */
  readonly branch: DocumentContact | undefined;
  /** La ficha en la web, si está publicada y Mi empresa tiene la plantilla de la URL. */
  readonly webUrl: string | undefined;
  readonly ownerReport: OwnerReport | undefined;
  readonly generatedAt: Date;
  readonly addressDisplay: PdfAddressDisplay;
}

/** Arma el PDF (pdf-lib), en español. */
export interface PropertyDocumentRenderer {
  render(content: PropertyDocumentContent): Promise<Uint8Array>;
}

/** El reporte al propietario de un período: lo entrega el módulo de reportes. */
export interface OwnerReports {
  build(propertyId: string, period: ReportPeriod, actor: Actor): Promise<OwnerReport | undefined>;
}

/** Los PDF pedidos de una propiedad, paginados en la base. */
export interface PropertyDocumentQuery {
  list(criteria: {
    readonly propertyId: string;
    readonly offset: number;
    readonly limit: number;
  }): Promise<
    PageSlice<Omit<PropertyDocumentRow, 'requestedBy'> & { readonly requestedBy: string }>
  >;
}
