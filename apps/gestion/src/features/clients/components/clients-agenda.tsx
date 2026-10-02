'use client';

import {
  CLIENT_KIND_LABELS,
  type ClientLetter,
  type ClientLetterCount,
  type ClientListRow,
} from '@norde/core/clients/contracts';
import { SoftBadge } from '@norde/ui/components/status-pill';
import { TablePagination } from '@norde/ui/components/table-pagination';
import { cn } from '@norde/ui/lib/utils';
import { ChevronDownIcon, Loader2Icon, LockIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { EMPTY_VALUE } from '../../../lib/format';
import {
  ListNavigationProvider,
  useListNavigation,
} from '../../shared/components/server-data-table';
import { clientName, formatPhone, userName } from '../client-format';

export interface AgendaLetterPage {
  readonly letter: ClientLetter;
  readonly rows: readonly ClientListRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

function letterLabel(letter: ClientLetter): string {
  return letter === '#' ? 'Otros (números y sin nombre)' : letter;
}

function ContactLine({ row }: { readonly row: ClientListRow }) {
  const phone = row.mobile ?? row.phone;
  return (
    <li className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Link
          href={`/contactos/${row.id}` as Route}
          className="truncate text-sm font-medium hover:underline"
        >
          {clientName(row.name)}
        </Link>
        {row.kind !== 'person' && <SoftBadge>{CLIENT_KIND_LABELS[row.kind]}</SoftBadge>}
        {row.companyName !== undefined && (
          <span className="hidden truncate text-xs text-muted-foreground md:inline">
            {row.companyName}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:text-sm">
        <span className="inline-flex items-center gap-1 tabular-nums">
          {row.contactMasked && <LockIcon className="h-3 w-3" aria-label="Datos de propietario" />}
          {phone === undefined ? EMPTY_VALUE : row.contactMasked ? phone : formatPhone(phone)}
        </span>
        <span className="max-w-[220px] truncate">{row.email ?? EMPTY_VALUE}</span>
        <span className="sm:w-[120px] sm:truncate">{userName(row.agent)}</span>
      </div>
    </li>
  );
}

function LetterPanel({ data }: { readonly data: AgendaLetterPage }) {
  const { setParams, pending } = useListNavigation();
  return (
    <div className={cn('border-t border-border', pending && 'opacity-60')}>
      {data.rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">No hay contactos en esta página.</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.rows.map((row) => (
            <ContactLine key={row.id} row={row} />
          ))}
        </ul>
      )}
      {data.total > data.pageSize && (
        <div className="border-t border-border px-4 py-2">
          <TablePagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPageChange={(page) => {
              setParams({ page });
            }}
            onPageSizeChange={(pageSize) => {
              setParams({ pageSize });
            }}
          />
        </div>
      )}
    </div>
  );
}

function AgendaBody({
  letters,
  open,
  toolbar,
}: {
  readonly letters: readonly ClientLetterCount[];
  readonly open: AgendaLetterPage | undefined;
  readonly toolbar: ReactNode;
}) {
  const { setParams, pending } = useListNavigation();
  const total = letters.reduce((sum, item) => sum + item.count, 0);
  const withContacts = letters.filter((item) => item.count > 0);

  function toggle(letter: ClientLetter) {
    // Abrir otra letra vuelve a su página 1; cerrar la abierta quita el param.
    setParams({ letter: open?.letter === letter ? undefined : letter });
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3">{toolbar}</div>
      <nav aria-label="Índice alfabético" className="border-b border-border px-2 py-2">
        <ul className="flex flex-wrap justify-center gap-0.5">
          {letters.map((item) => (
            <li key={item.letter}>
              <button
                type="button"
                disabled={item.count === 0}
                aria-pressed={open?.letter === item.letter}
                title={`${letterLabel(item.letter)}: ${item.count.toLocaleString('es-AR')} contactos`}
                className={cn(
                  'h-8 min-w-8 rounded px-1.5 text-sm font-medium tabular-nums transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  open?.letter === item.letter
                    ? 'bg-foreground text-background'
                    : 'text-foreground hover:bg-accent disabled:text-muted-foreground/50 disabled:hover:bg-transparent',
                )}
                onClick={() => {
                  toggle(item.letter);
                }}
              >
                {item.letter}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {total === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No hay contactos con estos filtros.
        </p>
      ) : (
        <ul aria-busy={pending} className="divide-y divide-border">
          {withContacts.map((item) => {
            const expanded = open?.letter === item.letter;
            return (
              <li key={item.letter}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => {
                    toggle(item.letter);
                  }}
                >
                  <span className="text-base font-semibold">{letterLabel(item.letter)}</span>
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
                    {item.count.toLocaleString('es-AR')}
                    {pending && expanded ? (
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                    ) : (
                      <ChevronDownIcon
                        className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
                      />
                    )}
                  </span>
                </button>
                {expanded && <LetterPanel data={open} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * La agenda alfabética: índice A–Z con cuántos contactos hay en cada letra (con los filtros
 * aplicados) y un acordeón. Solo la letra abierta trae sus contactos, paginados en el servidor.
 */
export function ClientsAgenda(props: {
  readonly letters: readonly ClientLetterCount[];
  readonly open: AgendaLetterPage | undefined;
  readonly toolbar: ReactNode;
}) {
  return (
    <ListNavigationProvider>
      <AgendaBody {...props} />
    </ListNavigationProvider>
  );
}
