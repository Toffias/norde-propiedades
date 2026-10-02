import { canActOn, OWNERSHIP_RULES } from '../../../identity';
import {
  err,
  ok,
  toOffsetLimit,
  toPage,
  type Actor,
  type ForbiddenError,
  type Page,
  type Result,
} from '../../../shared';
import {
  ListInquiryMatchesQuerySchema,
  type InquiryClientMatch,
  type ListInquiryMatchesQuery,
} from '../../contracts';
import { invalidInput, type InvalidInputError } from '../client-support';
import { canManageInquiries, findInquiry, type InquiryNotFoundError } from '../inquiry-support';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';
import type { InquiryMatchQuery } from '../ports/inquiry-match-query';

export type ListInquiryMatchesError = ForbiddenError | InvalidInputError | InquiryNotFoundError;

/**
 * Los clientes que comparten el teléfono o el email de una consulta, para elegir a cuál asignarla
 * (`inquiries:manage`). Están todos, también los de otros agentes y los de la papelera: si no, se
 * crearía un duplicado. De los que el actor no puede ver se muestran solo el nombre, el agente y
 * las fechas; los datos de contacto son los de la consulta.
 */
export class ListInquiryMatches {
  constructor(
    private readonly deps: {
      readonly uow: ClientsUnitOfWork;
      readonly matches: InquiryMatchQuery;
      readonly agents: ClientAgents;
    },
  ) {}

  async execute(
    input: ListInquiryMatchesQuery,
    actor: Actor,
  ): Promise<Result<Page<InquiryClientMatch>, ListInquiryMatchesError>> {
    if (!canManageInquiries(actor)) return err({ type: 'Forbidden' });

    const parsed = ListInquiryMatchesQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { page, pageSize, inquiryId } = parsed.data;

    const inquiry = await this.deps.uow.run((tx) => findInquiry(tx.inquiries, inquiryId));
    if (!inquiry) return err({ type: 'InquiryNotFound' });

    const { phoneMatchKey, email } = inquiry.sender;
    const slice = await this.deps.matches.search({
      phoneMatchKey,
      email,
      ...toOffsetLimit({ page, pageSize }),
    });
    const agentIds = slice.items.flatMap((item) => item.agentId ?? []);
    const names = await this.deps.agents.names([...new Set(agentIds)]);

    const items = slice.items.map((item): InquiryClientMatch => ({
      id: item.id,
      name: item.name ?? item.companyName,
      agent:
        item.agentId === undefined
          ? undefined
          : { id: item.agentId, name: names.get(item.agentId) },
      matchedByPhone: item.matchedByPhone,
      matchedByEmail: item.matchedByEmail,
      createdAt: item.createdAt,
      lastContactAt: item.lastContactAt,
      deleted: item.deletedAt !== undefined,
      viewable: canActOn(actor, OWNERSHIP_RULES.clientsRead, {
        ownerId: item.agentId,
        ownerBranchId: item.branchId,
      }),
    }));
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }
}
