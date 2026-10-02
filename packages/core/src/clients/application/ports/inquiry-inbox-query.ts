import type { PageSlice } from '../../../shared';
import type { InquiryTabValue } from '../../contracts';
import type { ContactChannel } from '../../domain/contact-channel';

/** Una consulta tal como sale de la base: las otras entidades, solo por ID. */
export interface InquiryInboxItem {
  readonly id: string;
  readonly channel: ContactChannel;
  readonly status: InquiryTabValue;
  readonly receivedAt: Date;
  readonly senderName: string | undefined;
  readonly senderEmail: string | undefined;
  readonly senderPhoneE164: string | undefined;
  readonly message: string | undefined;
  readonly autoTags: readonly string[];
  readonly propertyId: string | undefined;
  readonly branchId: string | undefined;
  readonly clientId: string | undefined;
  readonly assignedAgentId: string | undefined;
  readonly assignedAt: Date | undefined;
  readonly deletedAt: Date | undefined;
  readonly deletedBy: string | undefined;
}

export interface InquiryInboxCriteria {
  /** `deleted`: las de "Borradas"; las otras pestañas no incluyen las borradas. */
  readonly tab: InquiryTabValue;
  readonly branchId: string | undefined;
  readonly channel: ContactChannel | undefined;
  readonly propertyId: string | undefined;
  /** Recibidas desde (inclusive) y hasta (exclusive). */
  readonly received: { readonly from: Date | undefined; readonly to: Date | undefined };
  readonly sort: { readonly field: 'receivedAt'; readonly direction: 'asc' | 'desc' };
  readonly offset: number;
  readonly limit: number;
}

/** La bandeja de consultas, paginada, filtrada y ordenada en la base. */
export interface InquiryInboxQuery {
  search(criteria: InquiryInboxCriteria): Promise<PageSlice<InquiryInboxItem>>;
  /** Las pendientes (sin asignar ni borrar): el contador del menú. */
  countPending(): Promise<number>;
}
