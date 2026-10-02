import { ok, type Actor, type Result } from '../../../shared';
import { canReadInquiries } from '../inquiry-support';
import type { InquiryInboxQuery } from '../ports/inquiry-inbox-query';

/** El contador del menú: las consultas sin asignar. Sin "Ver consultas", cero. */
export class CountPendingInquiries {
  constructor(private readonly deps: { readonly inbox: InquiryInboxQuery }) {}

  async execute(actor: Actor): Promise<Result<number, never>> {
    if (actor.kind !== 'user' || !canReadInquiries(actor)) return ok(0);
    return ok(await this.deps.inbox.countPending());
  }
}
