import type { OwnerReport } from '../../../reporting';
import type { Actor, PageSlice } from '../../../shared';
import type { PanelPropertyDetail, PropertyDocumentRow } from '../../contracts';
import type { DocumentContact } from './document-contacts';
import type { OwnerReportOptions, PdfPrice, ReportPeriod } from '../../domain/property-document';

/** Lo que imprime el reporte al propietario, ya resuelto por el caso de uso. */
export interface OwnerReportContent {
  readonly property: PanelPropertyDetail;
  /** La dirección según "Ficha y PDF". */
  readonly address: string;
  readonly prices: readonly PdfPrice[];
  /** La foto de la tarjeta de la propiedad: la primera marcada para el PDF. */
  readonly photo: Uint8Array | undefined;
  readonly company: { readonly name: string; readonly logo: Uint8Array | undefined };
  /** La sucursal de la propiedad, si "Ficha y PDF" muestra el contacto de la empresa. */
  readonly contact: DocumentContact | undefined;
  /** "Tu productor": el productor de la propiedad (o quien lo pidió), si van los datos del agente. */
  readonly producer: DocumentContact | undefined;
  /** La ficha en la web, si está publicada y Mi empresa tiene la plantilla de la URL. */
  readonly webUrl: string | undefined;
  readonly report: OwnerReport;
  readonly options: OwnerReportOptions;
  readonly generatedAt: Date;
}

/** Arma el PDF del reporte al propietario. */
export interface OwnerReportRenderer {
  render(content: OwnerReportContent): Promise<Uint8Array>;
}

/** El reporte al propietario de un período: lo entrega el módulo de reportes. */
export interface OwnerReports {
  /** `listedAt`: el alta de la propiedad, para comparar "desde el alta". */
  build(
    propertyId: string,
    period: ReportPeriod & { readonly listedAt: Date },
    actor: Actor,
  ): Promise<OwnerReport | undefined>;
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
