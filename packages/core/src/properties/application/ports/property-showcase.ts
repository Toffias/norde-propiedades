import type { PanelPropertyDetail } from '../../contracts';
import type { PdfPrice } from '../../domain/property-document';
import type { ShowcaseOptions } from '../../domain/showcase-options';
import type { DocumentContact } from './document-contacts';

/** Lo que imprime el PDF de vidriera, ya resuelto por el caso de uso. */
export interface ShowcaseContent {
  readonly property: PanelPropertyDetail;
  /** La dirección según "Ficha y PDF". */
  readonly address: string;
  readonly prices: readonly PdfPrice[];
  /** Las fotos elegidas (o las primeras de la ficha), en orden: 1 o 3. */
  readonly photos: readonly Uint8Array[];
  readonly company: {
    readonly name: string;
    readonly logo: Uint8Array | undefined;
    /** El color de marca de Mi empresa (`#rrggbb`): títulos, badges e íconos. */
    readonly brandColor: string;
  };
  /** La sucursal de la propiedad, si "Ficha y PDF" muestra el contacto de la empresa. */
  readonly contact: DocumentContact | undefined;
  /** El agente que lo pidió, si van sus datos. */
  readonly agent: DocumentContact | undefined;
  /** La ficha en la web, para el QR: solo si se pidió y la propiedad está publicada en la web. */
  readonly qrUrl: string | undefined;
  readonly options: ShowcaseOptions;
  readonly generatedAt: Date;
}

/** Arma el PDF de vidriera: una sola hoja, vertical u horizontal. */
export interface ShowcaseRenderer {
  render(content: ShowcaseContent): Promise<Uint8Array>;
}
