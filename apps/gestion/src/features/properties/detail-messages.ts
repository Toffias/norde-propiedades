import type {
  ListPropertyInterestedClientsError,
  ListPropertySendsError,
} from '@norde/core/clients';
import type {
  ChangePropertyCodeError,
  ChangePropertyProducerError,
  ChangePropertyStatusError,
  ChangePropertyTagsError,
  CreateCustomAttributeError,
  GetPanelPropertyDetailError,
  ListPropertyDocumentsError,
  ListPropertyHistoryError,
  RequestPropertyDocumentError,
  SendOwnerReportError,
  UpdateCustomAttributeError,
  UpdatePropertyCharacteristicsError,
  UpdatePropertyCustomAttributesError,
  UpdatePropertyDealError,
  UpdatePropertyDescriptionError,
  UpdatePropertyFeaturesError,
  UpdatePropertyInternalInfoError,
  UpdatePropertyLocationError,
  UpdatePropertyOperationsError,
  UpdatePropertyPublicationError,
} from '@norde/core/properties';
import type { GetPropertyStatisticsError } from '@norde/core/reporting';

import type { ErrorMessages } from '../../lib/errors';

// Errores esperados de la ficha de propiedad → mensajes para la UI.

/** Todo lo que puede fallar al editar la ficha, sección por sección. */
export type PropertyDetailEditError =
  | UpdatePropertyLocationError
  | ChangePropertyCodeError
  | UpdatePropertyOperationsError
  | ChangePropertyStatusError
  | UpdatePropertyCharacteristicsError
  | UpdatePropertyDealError
  | UpdatePropertyFeaturesError
  | UpdatePropertyDescriptionError
  | UpdatePropertyCustomAttributesError
  | ChangePropertyTagsError
  | ChangePropertyProducerError
  | UpdatePropertyInternalInfoError
  | UpdatePropertyPublicationError;

export const DETAIL_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para hacer este cambio en esta propiedad.',
  InvalidInput: 'Revisá los datos marcados y probá de nuevo.',
  PropertyNotFound: 'No encontramos esa propiedad. Puede que la hayan borrado.',
  PropertyInTrash: 'La propiedad está en la papelera: restaurala para editarla.',
  InvalidCoordinates: 'La latitud o la longitud no son válidas.',
  LocationNotFound: 'No encontramos esa ubicación. Elegila de nuevo en el buscador.',
  InvalidReferenceCode: 'El código lleva de 2 a 20 letras, números o guiones.',
  ReferenceCodeTaken: 'Ya hay otra propiedad con ese código.',
  InvalidOperations: (error) =>
    error.reason === 'empty'
      ? 'La propiedad tiene que tener al menos una operación.'
      : 'Cada operación va una sola vez.',
  NegativePrice: 'Los montos no pueden ser negativos.',
  InvalidCommission: 'La comisión va de 0 a 100, con hasta dos decimales.',
  StatusNotManual: 'Ese estado no se elige a mano: lo marca una reserva.',
  PropertyReserved: 'La propiedad está reservada: primero se cae o se firma la reserva.',
  InvalidStatusTransition: 'La propiedad no puede pasar a ese estado desde el actual.',
  NegativeCharacteristic: 'Las medidas y cantidades no pueden ser negativas.',
  CoveredExceedsTotal: 'La superficie cubierta y semicubierta no puede superar la total.',
  FeatureNotFound: 'Algún ítem del catálogo ya no existe. Recargá la página y probá de nuevo.',
  CustomAttributeNotFound: 'Algún atributo personalizado ya no existe o está desactivado.',
  InvalidCustomAttributeValue: 'Revisá los valores de los atributos personalizados.',
  TagNotFound: 'Alguna de las etiquetas ya no existe. Elegilas de nuevo.',
  ProducerNotFound: 'Ese usuario no existe o está suspendido: no puede ser captador.',
  UserNotFound: 'Algún usuario elegido no existe o está suspendido.',
} satisfies ErrorMessages<PropertyDetailEditError>;

export const DETAIL_READ_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver esta propiedad.',
  InvalidInput: 'La dirección no es válida.',
  PropertyNotFound: 'No encontramos esa propiedad.',
} satisfies ErrorMessages<GetPanelPropertyDetailError>;

export const DETAIL_LIST_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para ver esta información.',
  InvalidInput: 'Los filtros no son válidos. Revisalos y probá de nuevo.',
  PropertyNotFound: DETAIL_READ_ERROR_MESSAGES.PropertyNotFound,
} satisfies ErrorMessages<
  | ListPropertyHistoryError
  | ListPropertyDocumentsError
  | ListPropertyInterestedClientsError
  | ListPropertySendsError
  | GetPropertyStatisticsError
>;

export const DOCUMENT_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para exportar esta propiedad.',
  InvalidInput: 'Revisá las fechas y el email, y probá de nuevo.',
  PropertyNotFound: DETAIL_READ_ERROR_MESSAGES.PropertyNotFound,
  ReportPeriodRequired: 'Elegí el período del reporte.',
  DocumentNotFound: 'No encontramos ese reporte.',
  DocumentNotReady: 'El PDF todavía no está listo. Esperá unos segundos.',
  MailNotConfigured: 'El envío de emails no está configurado. Avisale a quien administra el panel.',
  MailRejected: (error) => `El proveedor de email rechazó el envío: ${error.reason}`,
  MailUnavailable: 'El proveedor de email no respondió. Probá de nuevo en unos minutos.',
} satisfies ErrorMessages<RequestPropertyDocumentError | SendOwnerReportError>;

export const CUSTOM_ATTRIBUTE_ERROR_MESSAGES = {
  Forbidden: 'No tenés permiso para cambiar esta configuración.',
  InvalidInput: 'Revisá los datos marcados y probá de nuevo.',
  CustomAttributeNameTaken: 'Ya hay un atributo con ese nombre.',
  InvalidCustomAttributeOptions: 'Un atributo de lista necesita al menos una opción.',
  CustomAttributeNotFound: 'No encontramos ese atributo.',
} satisfies ErrorMessages<CreateCustomAttributeError | UpdateCustomAttributeError>;
