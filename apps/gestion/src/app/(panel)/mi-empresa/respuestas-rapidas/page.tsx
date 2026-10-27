import { ListQuickRepliesQuerySchema, type QuickReplyRow } from '@norde/core/clients/contracts';
import type { Actor } from '@norde/core/shared';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../container';
import { QuickRepliesGrid } from '../../../../features/quick-replies/components/quick-replies-grid';
import {
  GET_QUICK_REPLY_ERROR_MESSAGES,
  LIST_QUICK_REPLIES_ERROR_MESSAGES,
} from '../../../../features/quick-replies/messages';
import { messageForError } from '../../../../lib/errors';
import { formatCount } from '../../../../lib/format';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { parsePanelParams, type PanelData, type PanelState } from '../../../../lib/panel-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Respuestas rápidas' };

export default async function QuickRepliesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const params = await searchParams;
  const { value: query, invalidKeys } = parseListParams(ListQuickRepliesQuerySchema, params);

  // Administrarlas es de Gerencia; un asesor solo las elige al enviar.
  if (!actor.can('quick-replies:manage')) {
    return (
      <Card className="gap-0 overflow-hidden p-0">
        <DataTableError message="No tenés permiso para administrar las respuestas rápidas." />
      </Card>
    );
  }

  const [replies, detail] = await Promise.all([
    getContainer().clients.listQuickReplies.execute(query, actor),
    loadQuickReplyPanel(parsePanelParams(params), actor),
  ]);

  if (replies.isErr()) {
    return (
      <Card className="gap-0 overflow-hidden p-0">
        <DataTableError
          message={messageForError(replies.error, LIST_QUICK_REPLIES_ERROR_MESSAGES)}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Plantillas para el mensaje de los envíos por email o WhatsApp. Cada asesor elige una al
        enviar y la puede ajustar antes de mandarla.{' '}
        {query.status === 'inactive'
          ? formatCount(replies.value.total, 'inactiva', 'inactivas')
          : formatCount(replies.value.total, 'respuesta activa', 'respuestas activas')}
        .
      </p>

      {invalidKeys.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Algunos parámetros de la dirección no eran válidos ({invalidKeys.join(', ')}) y se usaron
          los valores por defecto.
        </p>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        <QuickRepliesGrid
          rows={replies.value.items}
          total={replies.value.total}
          page={replies.value.page}
          pageSize={replies.value.pageSize}
          sort={query.sort}
          status={query.status}
          text={query.q ?? ''}
          detail={detail}
        />
      </Card>
    </div>
  );
}

/** La respuesta del panel de edición. */
async function loadQuickReplyPanel(
  panel: PanelState | undefined,
  actor: Actor,
): Promise<PanelData<QuickReplyRow> | undefined> {
  if (panel?.kind !== 'edit') return undefined;
  const reply = await getContainer().clients.getQuickReply.execute(
    { quickReplyId: panel.id },
    actor,
  );
  return reply.isErr()
    ? {
        id: panel.id,
        ok: false,
        message: messageForError(reply.error, GET_QUICK_REPLY_ERROR_MESSAGES),
      }
    : { id: panel.id, ok: true, value: reply.value };
}
