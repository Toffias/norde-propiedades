import {
  ListClientHistoryQuerySchema,
  ListClientRelationsQuerySchema,
} from '@norde/core/clients/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import { cn } from '@norde/ui/lib/utils';
import { ArrowLeftIcon } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getContainer } from '../../../../container';
import { ClientDetailHeader } from '../../../../features/clients/components/client-detail-header';
import { ClientDetailSections } from '../../../../features/clients/components/client-detail-sections';
import { ClientHistoryGrid } from '../../../../features/clients/components/client-history-grid';
import { clientName } from '../../../../features/clients/client-format';
import {
  CLIENT_DETAIL_ERROR_MESSAGES,
  CLIENT_HISTORY_ERROR_MESSAGES,
} from '../../../../features/clients/messages';
import { messageForError } from '../../../../lib/errors';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

const TABS = [
  { id: 'detalles', label: 'Detalles' },
  { id: 'historial', label: 'Historial' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function tabFrom(params: SearchParams): Tab {
  const raw = params.tab;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return TABS.find((tab) => tab.id === value)?.id ?? 'detalles';
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<Metadata> {
  const { actor } = await requireSession();
  const { id } = await params;
  const detail = await getContainer().clients.getClientDetail.execute({ clientId: id }, actor);
  return { title: detail.isOk() ? `${clientName(detail.value.name)} · Contactos` : 'Contacto' };
}

/** Pestañas de la ficha. Viven en la URL (`?tab=historial`): se pueden compartir y recargar. */
function Tabs({
  clientId,
  active,
  showHistory,
}: {
  readonly clientId: string;
  readonly active: Tab;
  readonly showHistory: boolean;
}) {
  return (
    <nav aria-label="Secciones de la ficha" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="inline-flex min-w-full gap-1 rounded-xl bg-muted p-1 sm:min-w-0">
        {TABS.filter((tab) => tab.id !== 'historial' || showHistory).map((tab) => (
          <li key={tab.id}>
            <Link
              // Misma ficha con otra pestaña: typedRoutes no verifica un string armado.
              href={
                `/contactos/${clientId}${tab.id === 'detalles' ? '' : `?tab=${tab.id}`}` as Route
              }
              aria-current={tab.id === active ? 'page' : undefined}
              scroll={false}
              className={cn(
                'inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                tab.id === active && 'bg-background text-foreground shadow-sm dark:bg-card',
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default async function ContactDetailPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { clients } = getContainer();
  const result = await clients.getClientDetail.execute({ clientId: id }, actor);
  if (result.isErr()) {
    if (result.error.type === 'ClientNotFound' || result.error.type === 'InvalidInput') {
      notFound();
    }
    // Se unificó con otro: los datos (y el historial de los dos) están en el principal.
    if (result.error.type === 'ClientMerged') {
      redirect(`/contactos/${result.error.clientId}` as Route);
    }
    return <DataTableError message={messageForError(result.error, CLIENT_DETAIL_ERROR_MESSAGES)} />;
  }
  const detail = result.value;
  const tab = detail.can.viewHistory ? tabFrom(query) : 'detalles';

  let relations: ReactNode = null;
  if (tab === 'detalles') {
    const page = query.relPage;
    const { value: relationsQuery } = parseListParams(ListClientRelationsQuerySchema, {
      clientId: detail.id,
      pageSize: '10',
      ...(page === undefined ? {} : { page }),
    });
    const relationsPage = await clients.listClientRelations.execute(relationsQuery, actor);
    relations = (
      <ClientDetailSections
        detail={detail}
        relations={relationsPage.isOk() ? relationsPage.value : undefined}
      />
    );
  }

  let history: ReactNode = null;
  if (tab === 'historial') {
    const { value: historyQuery } = parseListParams(ListClientHistoryQuerySchema, {
      ...query,
      clientId: detail.id,
    });
    const page = await clients.listClientHistory.execute(historyQuery, actor);
    history = (
      <Card className="gap-0 overflow-hidden p-0">
        {page.isErr() ? (
          <DataTableError message={messageForError(page.error, CLIENT_HISTORY_ERROR_MESSAGES)} />
        ) : (
          <ClientHistoryGrid page={page.value} from={historyQuery.from} to={historyQuery.to} />
        )}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/contactos"
        className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Volver a contactos
      </Link>

      <ClientDetailHeader detail={detail} canPickAgents={actor.can('users:read')} />
      <Tabs clientId={detail.id} active={tab} showHistory={detail.can.viewHistory} />

      {tab === 'historial' ? history : relations}
    </div>
  );
}
