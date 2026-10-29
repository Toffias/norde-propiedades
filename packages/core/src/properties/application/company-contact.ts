import { withPdfContactText, type PdfOptions } from '../../settings';

import type { DocumentContact, DocumentContacts } from './ports/document-contacts';

/**
 * El contacto de la empresa para un PDF, si "Ficha y PDF" lo muestra: la sucursal (o la casa
 * central) con su texto libre o, si no tiene, el de Mi empresa.
 */
export async function companyContact(
  contacts: DocumentContacts,
  branchId: string | undefined,
  options: PdfOptions,
): Promise<DocumentContact | undefined> {
  if (!options.showCompanyContact) return undefined;
  const branch = await contacts.branch(branchId);
  return branch === undefined ? undefined : withPdfContactText(branch, options);
}
