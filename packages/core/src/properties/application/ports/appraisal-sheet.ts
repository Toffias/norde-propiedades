import type { PanelPropertyDetail } from '../../contracts';

/** Un propietario en la planilla: nombre, teléfono, celular y email. */
export interface OwnerContact {
  readonly name: string;
  /** E.164. */
  readonly phone: string | undefined;
  /** E.164: el primer celular cargado. */
  readonly mobile: string | undefined;
  readonly email: string | undefined;
}

/** Una casilla de la planilla: un servicio, ambiente o adicional del catálogo. */
export interface AppraisalSheetFeature {
  readonly name: string;
  /** Ya está cargado en la ficha: la casilla sale marcada. */
  readonly checked: boolean;
}

/** Lo que imprime la planilla de tasación, ya resuelto por el caso de uso. */
export interface AppraisalSheetContent {
  readonly property: PanelPropertyDetail;
  /** La dirección completa: la planilla es interna. */
  readonly address: string;
  /** Vacío si quien la arma no puede ver los datos de los propietarios. */
  readonly owners: readonly OwnerContact[];
  readonly features: {
    readonly service: readonly AppraisalSheetFeature[];
    readonly room: readonly AppraisalSheetFeature[];
    readonly amenity: readonly AppraisalSheetFeature[];
  };
  readonly company: { readonly name: string; readonly logo: Uint8Array | undefined };
  readonly generatedAt: Date;
}

/** Arma el PDF de la planilla de tasación: una hoja para imprimir y completar en la visita. */
export interface AppraisalSheetRenderer {
  render(content: AppraisalSheetContent): Promise<Uint8Array>;
}

/** Los datos de contacto de los propietarios (módulo clients), solo por ID. */
export interface OwnerContacts {
  /** `undefined` si el cliente ya no existe, está en la papelera o se unificó con otro. */
  find(clientId: string): Promise<OwnerContact | undefined>;
}
