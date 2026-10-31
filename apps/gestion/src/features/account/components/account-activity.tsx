'use client';

import {
  ACTIVITY_AREA_VALUES,
  type ActivityAreaValue,
  type ActivityEntryRow,
} from '@norde/core/audit/contracts';
import type { Page } from '@norde/core/shared';
import { Badge } from '@norde/ui/components/badge';
import { DateRangePicker } from '@norde/ui/components/date-range-picker';
import { Label } from '@norde/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { TablePagination } from '@norde/ui/components/table-pagination';
import { cn } from '@norde/ui/lib/utils';
import {
  BriefcaseIcon,
  Building2Icon,
  ClipboardListIcon,
  HistoryIcon,
  HomeIcon,
  SettingsIcon,
  UserRoundIcon,
  UsersRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';

import { formatTime } from '../../../lib/format';
import { newsDayLabel, newsDayOf } from '../../news/news-format';
import { HistoryChanges } from '../../shared/components/audit-history-grid';
import {
  ListNavigationProvider,
  useListNavigation,
} from '../../shared/components/server-data-table';
import {
  ACTIVITY_AREA_LABELS,
  activityActionLabel,
  activityFormat,
  activityHref,
} from '../activity-labels';

const ALL = '__all__';
const PAGE_SIZES = [25, 50] as const;

const AREA_ICONS: Readonly<Record<ActivityAreaValue, LucideIcon>> = {
  properties: HomeIcon,
  developments: Building2Icon,
  clients: UsersRoundIcon,
  opportunities: BriefcaseIcon,
  appraisals: ClipboardListIcon,
  users: UserRoundIcon,
  other: SettingsIcon,
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Filters({
  area,
  from,
  to,
}: {
  readonly area: ActivityAreaValue | undefined;
  readonly from: string | undefined;
  readonly to: string | undefined;
}) {
  const id = useId();
  const { setParams } = useListNavigation();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-area`} className="text-xs">
          Área
        </Label>
        <Select
          value={area ?? ALL}
          onValueChange={(value) => {
            setParams({ area: value === ALL ? undefined : value });
          }}
        >
          <SelectTrigger id={`${id}-area`} size="sm" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas</SelectItem>
            {ACTIVITY_AREA_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {ACTIVITY_AREA_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-period`} className="text-xs">
          Período
        </Label>
        <DateRangePicker
          id={`${id}-period`}
          label="Período"
          value={{ from: from ?? '', to: to ?? '' }}
          onChange={(range) => {
            setParams({ from: range.from, to: range.to });
          }}
          className="h-8 w-60"
        />
      </div>
    </div>
  );
}

/** La entidad sobre la que actuó: código y nombre, con enlace a su ficha si tiene una. */
function EntityReference({
  entry,
  viewerId,
}: {
  readonly entry: ActivityEntryRow;
  readonly viewerId: string;
}) {
  const { entity } = entry;
  // Su propia cuenta no se nombra: "Ingresó al panel" alcanza.
  if (entity === undefined || (entry.entityType === 'user' && entry.entityId === viewerId)) {
    return null;
  }
  const href = activityHref(entry);
  const content = (
    <>
      {entity.code !== undefined && (
        <span className="font-mono text-xs text-muted-foreground">{entity.code}</span>
      )}
      {entity.name !== undefined && <span className="truncate">{entity.name}</span>}
    </>
  );
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
      {href === undefined ? (
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">{content}</span>
      ) : (
        <Link
          href={href}
          className="inline-flex min-w-0 items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
        >
          {content}
        </Link>
      )}
      {entity.deleted && (
        <Badge variant="outline" className="shrink-0 text-[0.65rem]">
          En la papelera
        </Badge>
      )}
    </span>
  );
}

function Entry({
  entry,
  viewerId,
  last,
}: {
  readonly entry: ActivityEntryRow;
  readonly viewerId: string;
  readonly last: boolean;
}) {
  const Icon = AREA_ICONS[entry.area];
  const format = activityFormat(entry);
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!last && (
        <span
          aria-hidden
          className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-border"
        />
      )}
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground"
        title={ACTIVITY_AREA_LABELS[entry.area]}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span>{capitalize(activityActionLabel(entry))}</span>
            <EntityReference entry={entry} viewerId={viewerId} />
          </p>
          <time
            dateTime={entry.occurredAt.toISOString()}
            className="shrink-0 text-xs text-muted-foreground tabular-nums"
          >
            {formatTime(entry.occurredAt)}
          </time>
        </div>
        {format !== undefined && <HistoryChanges changes={entry.changes} format={format} />}
      </div>
    </li>
  );
}

function groupByDay(entries: readonly ActivityEntryRow[]) {
  const days: { day: string; entries: ActivityEntryRow[] }[] = [];
  for (const entry of entries) {
    const day = newsDayOf(entry.occurredAt);
    const current = days.at(-1);
    if (current?.day === day) current.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }
  return days;
}

function Timeline({
  page,
  viewerId,
  today,
  filtered,
}: {
  readonly page: Page<ActivityEntryRow>;
  readonly viewerId: string;
  readonly today: string;
  readonly filtered: boolean;
}) {
  const { setParams, pending } = useListNavigation();
  if (page.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <HistoryIcon className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          {filtered
            ? 'No hay acciones con estos filtros.'
            : 'Todavía no hay acciones registradas con tu cuenta.'}
        </p>
      </div>
    );
  }
  return (
    <>
      <div
        className={cn('flex flex-col gap-6 px-4 py-5 sm:px-6', pending && 'opacity-60')}
        aria-busy={pending}
      >
        {groupByDay(page.items).map(({ day, entries }) => (
          <section key={day} aria-label={newsDayLabel(day, today)} className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {newsDayLabel(day, today)}
            </h3>
            <ol>
              {entries.map((entry, index) => (
                <Entry
                  key={entry.id}
                  entry={entry}
                  viewerId={viewerId}
                  last={index === entries.length - 1}
                />
              ))}
            </ol>
          </section>
        ))}
      </div>
      <TablePagination
        page={page.page}
        pageSize={page.pageSize}
        total={page.total}
        pageSizes={PAGE_SIZES}
        onPageChange={(next) => {
          setParams({ page: String(next) });
        }}
        onPageSizeChange={(size) => {
          setParams({ pageSize: String(size) });
        }}
      />
    </>
  );
}

/**
 * El historial de Mi cuenta: lo que hizo quien mira, agrupado por día, con filtros por área y fechas
 * y paginado en el servidor (el estado vive en la URL).
 */
export function AccountActivity({
  page,
  viewerId,
  today,
  area,
  from,
  to,
}: {
  readonly page: Page<ActivityEntryRow>;
  readonly viewerId: string;
  /** Hoy en Buenos Aires (`AAAA-MM-DD`), para "Hoy" y "Ayer". */
  readonly today: string;
  readonly area: ActivityAreaValue | undefined;
  readonly from: string | undefined;
  readonly to: string | undefined;
}) {
  return (
    <ListNavigationProvider>
      <div className="border-b border-border/40 px-4 py-3 sm:px-6">
        <Filters area={area} from={from} to={to} />
      </div>
      <Timeline
        page={page}
        viewerId={viewerId}
        today={today}
        filtered={area !== undefined || from !== undefined || to !== undefined}
      />
    </ListNavigationProvider>
  );
}
