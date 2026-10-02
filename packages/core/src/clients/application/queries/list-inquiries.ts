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
  INQUIRY_TAG_KIND_VALUES,
  ListInquiriesQuerySchema,
  type InquiryInboxRow,
  type InquiryTag,
  type ListInquiriesQuery,
} from '../../contracts';
import { suggestedOpportunityType } from '../../domain/inquiry';
import { dayRange, invalidInput, type InvalidInputError } from '../client-support';
import { canReadInquiries } from '../inquiry-support';
import type { BranchNames } from '../ports/branch-names';
import type { ClientAgents } from '../ports/client-agents';
import type { ClientListings } from '../ports/client-record-query';
import type { InquiryInboxItem, InquiryInboxQuery } from '../ports/inquiry-inbox-query';

export type ListInquiriesError = ForbiddenError | InvalidInputError;

/** `tipo:valor` → etiqueta; un tipo que no se conoce no se muestra. */
function toTag(code: string): InquiryTag | undefined {
  const separator = code.indexOf(':');
  const kind = INQUIRY_TAG_KIND_VALUES.find((k) => k === code.slice(0, separator));
  const value = code.slice(separator + 1);
  return kind === undefined || value === '' ? undefined : { kind, value };
}

function userRef(id: string | undefined, names: ReadonlyMap<string, string>) {
  return id === undefined ? undefined : { id, name: names.get(id) };
}

/**
 * Una pestaña de la bandeja de consultas (Pendientes, Asignadas o Borradas), paginada y filtrada en
 * el servidor. La ve quien tiene "Ver consultas": todas, no solo las suyas.
 */
export class ListInquiries {
  constructor(
    private readonly deps: {
      readonly inbox: InquiryInboxQuery;
      readonly listings: ClientListings;
      readonly agents: ClientAgents;
      readonly branches: BranchNames;
    },
  ) {}

  async execute(
    input: ListInquiriesQuery,
    actor: Actor,
  ): Promise<Result<Page<InquiryInboxRow>, ListInquiriesError>> {
    if (!canReadInquiries(actor)) return err({ type: 'Forbidden' });

    const parsed = ListInquiriesQuerySchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const { page, pageSize, sort, tab, branchId, channel, propertyId } = parsed.data;

    const slice = await this.deps.inbox.search({
      tab,
      branchId,
      channel,
      propertyId: propertyId?.toLowerCase(),
      received: dayRange(parsed.data.receivedFrom, parsed.data.receivedTo),
      sort,
      ...toOffsetLimit({ page, pageSize }),
    });
    const items = await this.toRows(slice.items, actor);
    return ok(toPage({ items, total: slice.total }, { page, pageSize }));
  }

  private async toRows(
    items: readonly InquiryInboxItem[],
    actor: Actor,
  ): Promise<InquiryInboxRow[]> {
    const unique = (values: (string | undefined)[]) => [
      ...new Set(values.filter((v): v is string => v !== undefined)),
    ];
    const [listings, branches] = await Promise.all([
      this.deps.listings.summaries(unique(items.map((i) => i.propertyId)), actor),
      this.deps.branches.names(unique(items.map((i) => i.branchId))),
    ]);
    const users = await this.deps.agents.names(
      unique([
        ...items.flatMap((i) => [i.assignedAgentId, i.deletedBy]),
        ...[...listings.values()].map((l) => l.producer?.id),
      ]),
    );

    return items.map((item) => {
      const property = item.propertyId === undefined ? undefined : listings.get(item.propertyId);
      return {
        id: item.id,
        channel: item.channel,
        status: item.status,
        receivedAt: item.receivedAt,
        senderName: item.senderName,
        senderEmail: item.senderEmail,
        senderPhone: item.senderPhoneE164,
        message: item.message,
        tags: item.autoTags.map(toTag).filter((tag) => tag !== undefined),
        propertyId: item.propertyId,
        property: property && {
          ...property,
          producer: userRef(property.producer?.id, users),
        },
        branch:
          item.branchId === undefined
            ? undefined
            : { id: item.branchId, name: branches.get(item.branchId) },
        clientId: item.clientId,
        assignedAgent: userRef(item.assignedAgentId, users),
        assignedAt: item.assignedAt,
        suggestedType: suggestedOpportunityType(item.autoTags),
        deletedAt: item.deletedAt,
        // Un proceso (`system:...`) no es un usuario del panel: no se muestra quién.
        deletedBy: item.deletedBy?.startsWith('system:')
          ? undefined
          : userRef(item.deletedBy, users),
      };
    });
  }
}
