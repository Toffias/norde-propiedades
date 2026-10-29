import type { PanelPropertyDetail } from '../../contracts';
import type { PdfPrice } from '../../domain/property-document';
import type { PropertySheetLayout } from '../../domain/property-sheet';
import type { DocumentContact } from './document-contacts';

/** Lo que imprime la ficha de una propiedad, ya resuelto (dirección y precios según las reglas). */
export interface PropertySheet {
  readonly property: PanelPropertyDetail;
  readonly address: string;
  readonly prices: readonly PdfPrice[];
  /** Las fotos marcadas para el PDF, en orden, tal como están guardadas. */
  readonly photos: readonly Uint8Array[];
  /** El mapa de la ubicación (PNG), en los formatos con mapa y si la propiedad tiene coordenadas. */
  readonly map: Uint8Array | undefined;
  /** La ficha en la web, si está publicada. */
  readonly webUrl: string | undefined;
}

/** Un PDF de fichas: una propiedad (la ficha) o varias (la selección del buscador). */
export interface PropertySheetsContent {
  readonly layout: PropertySheetLayout;
  /** El título del PDF (metadatos): "Ficha NHO0001" o "Propiedades seleccionadas". */
  readonly title: string;
  readonly company: {
    readonly name: string;
    readonly logo: Uint8Array | undefined;
    /** La sucursal en la cabecera y el pie, si "Ficha y PDF" muestra los datos de la empresa. */
    readonly contact: DocumentContact | undefined;
  };
  /** Quien lo pidió, si el PDF lleva los datos del agente. */
  readonly agent: DocumentContact | undefined;
  readonly generatedAt: Date;
  /** De a una: las fotos de cien propiedades no se cargan todas juntas. */
  readonly sheets: AsyncIterable<PropertySheet>;
}

/** Arma el PDF de fichas en el formato pedido, en español. */
export interface PropertySheetRenderer {
  render(content: PropertySheetsContent): Promise<Uint8Array>;
}

/** Un mapa estático de un punto, para imprimir. */
export interface StaticMaps {
  /**
   * Imagen apaisada (2:1) centrada en el punto, con el marcador; el PDF la recorta a su recuadro.
   * `undefined` si el servicio de mapas no responde: el PDF sale con una foto en su lugar.
   */
  render(point: {
    readonly latitude: number;
    readonly longitude: number;
  }): Promise<Uint8Array | undefined>;
}
