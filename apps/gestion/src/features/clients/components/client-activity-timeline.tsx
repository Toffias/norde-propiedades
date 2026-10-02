'use client';

import {
  CLIENT_ACTIVITY_KIND_LABELS,
  CLIENT_ACTIVITY_KIND_VALUES,
  type ClientActivityKindValue,
  type ClientActivityRow,
} from '@norde/core/clients/contracts';
import type { Page } from '@norde/core/shared';
import type { DataTableColumn } from '@norde/ui/components/data-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import {
  ArrowRightLeftIcon,
  BotIcon,
  CombineIcon,
  EyeIcon,
  InboxIcon,
  SendIcon,
  StickyNoteIcon,
  ThumbsUpIcon,
  type LucideIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';

import { formatDateTime } from '../../../lib/format';
import { ServerDataTable, useListNavigation } from '../../shared/components/server-data-table';
import { activityActorName, activityTitle, inquirySummary } from '../activity-format';

const ANY = 'all';

const KIND_ICONS: Readonly<Record<ClientActivityKindValue, LucideIcon>> = {
  note: StickyNoteIcon,
  status_change: ArrowRightLeftIcon,
  listing_sent: SendIcon,
  listing_viewed: EyeIcon,
  listing_reaction: ThumbsUpIcon,
  inquiry: InboxIcon,
  message: BotIcon,
  merge: CombineIcon,
};

/** El detalle de una entrada: la nota, lo que pidió, a qué contacto se unificó. */
function Body({ entry }: { readonly entry: ClientActivityRow }) {
  switch (entry.kind) {
    case 'note':
      return <p className="text-sm whitespace-pre-line break-words">{entry.text}</p>;
    case 'inquiry':
      return (
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-muted-foreground">{inquirySummary(entry.type, entry.intent)}</p>
          {entry.note !== undefined && (
            <p className="whitespace-pre-line break-words">{entry.note}</p>
          )}
          {entry.propertyId !== undefined && (
            <Link
              // La ficha de la propiedad: typedRoutes no verifica un string armado.
              href={`/propiedades/${entry.propertyId}` as Route}
              className="self-start text-primary underline-offset-4 hover:underline"
            >
              Ver la propiedad
            </Link>
          )}
        </div>
      );
    case 'merge':
      return (
        <p className="text-sm text-muted-foreground">
          Sus teléfonos, emails, oportunidades y actividad quedaron en este contacto.
        </p>
      );
    case 'status_change':
      return entry.fromStage === undefined ? null : (
        <p className="text-sm text-muted-foreground">Estaba en “{entry.fromStage.name}”</p>
      );
    case 'listing_viewed':
    case 'listing_reaction':
    case 'listing_sent':
    case 'message':
      return null;
  }
}

/** Una entrada del timeline: icono del tipo, título, cuándo, quién y el detalle. */
export function ActivityEntry({ entry }: { readonly entry: ClientActivityRow }) {
  const Icon = KIND_ICONS[entry.kind];
  return (
    <div className="flex min-w-0 gap-3">
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm font-medium">{activityTitle(entry)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatDateTime(entry.occurredAt)}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{activityActorName(entry.actor)}</p>
        <Body entry={entry} />
      </div>
    </div>
  );
}

function KindFilter({ kind }: { readonly kind: ClientActivityKindValue | undefined }) {
  const { setParams } = useListNavigation();
  return (
    <Select
      value={kind ?? ANY}
      onValueChange={(next) => {
        setParams({ kind: next === ANY ? undefined : next });
      }}
    >
      <SelectTrigger className="w-full sm:w-[240px]" aria-label="Tipo de actividad">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>Toda la actividad</SelectItem>
        {CLIENT_ACTIVITY_KIND_VALUES.map((value) => (
          <SelectItem key={value} value={value}>
            {CLIENT_ACTIVITY_KIND_LABELS[value]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * El timeline del contacto: notas, consultas, conversaciones del agente de IA, envíos y
 * unificaciones, lo más reciente primero. Paginado en el servidor, como el historial.
 */
export function ClientActivityTimeline({
  page,
  kind,
}: {
  readonly page: Page<ClientActivityRow>;
  readonly kind: ClientActivityKindValue | undefined;
}) {
  const columns: readonly DataTableColumn<ClientActivityRow>[] = [
    {
      id: 'activity',
      header: 'Actividad',
      cell: (entry) => <ActivityEntry entry={entry} />,
    },
  ];

  return (
    <ServerDataTable
      label="Actividad del contacto"
      columns={columns}
      getRowId={(entry) => entry.id}
      rows={page.items}
      total={page.total}
      page={page.page}
      pageSize={page.pageSize}
      toolbar={<KindFilter kind={kind} />}
      empty={
        kind === undefined
          ? 'Todavía no hay actividad. Agregá una nota para empezar.'
          : 'No hay actividad de este tipo.'
      }
    />
  );
}
