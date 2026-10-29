'use client';

import {
  BACKGROUND_TASKS_PAGE_SIZE,
  MAX_BACKGROUND_TASKS_PAGE_SIZE,
  type BackgroundTaskKind,
  type BackgroundTaskRow,
  type BackgroundTaskScope,
  type BackgroundTasksPage,
} from '@norde/core/reporting/contracts';
import { Button } from '@norde/ui/components/button';
import { StatusPill } from '@norde/ui/components/status-pill';
import { cn } from '@norde/ui/lib/utils';
import {
  FilesIcon,
  FileTextIcon,
  ImageIcon,
  ImagesIcon,
  type LucideIcon,
  Loader2Icon,
  MegaphoneIcon,
  SheetIcon,
  UsersIcon,
  WorkflowIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import { countBackgroundTasksAction, listBackgroundTasksAction } from '../background-task-actions';
import {
  BACKGROUND_TASKS_CLEARED_COOKIE,
  CLOSED_POLL_MS,
  clearedUntil,
  formatProgress,
  OPEN_POLL_MS,
  taskFailure,
  taskHref,
  taskProblems,
  taskStatus,
  taskSubtitle,
  taskTitle,
} from '../background-tasks';

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

const KIND_ICONS: Readonly<Record<BackgroundTaskKind, LucideIcon>> = {
  media_variants: ImageIcon,
  import_media: ImagesIcon,
  client_import: SheetIcon,
  property_import: SheetIcon,
  unit_import: SheetIcon,
  tokko_users_import: UsersIcon,
  opportunity_bulk: WorkflowIcon,
  property_document: FileTextIcon,
  property_list_document: FilesIcon,
  portal_listing: MegaphoneIcon,
};

type Loaded =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly page: BackgroundTasksPage }
  | { readonly status: 'error'; readonly message: string };

const isActive = (task: BackgroundTaskRow) =>
  task.status === 'pending' || task.status === 'running';

/**
 * Los procesos del panel abierto: los trae al abrir y, mientras algo sigue en curso, cada
 * `OPEN_POLL_MS`. "Ver más" agranda la página (hasta el máximo del contract).
 */
function useTaskList(open: boolean, scope: BackgroundTaskScope, onActive: (n: number) => void) {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [pageSize, setPageSize] = useState(BACKGROUND_TASKS_PAGE_SIZE);
  const [version, setVersion] = useState(0);
  const active = loaded.status === 'ready' ? loaded.page.active : 0;

  useEffect(() => {
    if (!open) return undefined;
    let stale = false;
    listBackgroundTasksAction({ scope, pageSize }).then(
      (response) => {
        if (stale) return;
        if (response.ok) {
          setLoaded({ status: 'ready', page: response.value });
          onActive(response.value.active);
        } else setLoaded({ status: 'error', message: response.message });
      },
      () => {
        if (!stale) setLoaded({ status: 'error', message: UNEXPECTED_ERROR_MESSAGE });
      },
    );
    return () => {
      stale = true;
    };
  }, [open, scope, pageSize, version, onActive]);

  useEffect(() => {
    if (!open || active === 0) return undefined;
    const timer = setInterval(() => {
      setVersion((current) => current + 1);
    }, OPEN_POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [open, active]);

  return {
    loaded,
    canShowMore:
      loaded.status === 'ready' &&
      loaded.page.total > loaded.page.items.length &&
      pageSize < MAX_BACKGROUND_TASKS_PAGE_SIZE,
    showMore: () => {
      setPageSize((current) =>
        Math.min(current + BACKGROUND_TASKS_PAGE_SIZE, MAX_BACKGROUND_TASKS_PAGE_SIZE),
      );
    },
    reload: () => {
      setVersion((current) => current + 1);
    },
  };
}

function TaskRow({
  task,
  showRequester,
  onNavigate,
}: {
  readonly task: BackgroundTaskRow;
  readonly showRequester: boolean;
  readonly onNavigate: () => void;
}) {
  const Icon = KIND_ICONS[task.kind];
  const status = taskStatus(task);
  const subtitle = taskSubtitle(task);
  const progress = formatProgress(task.progress);
  const failure = taskFailure(task);
  const problems = taskProblems(task);
  const href = taskHref(task);
  const requester =
    task.requester === undefined ? 'El sistema' : (task.requester.name ?? 'Un usuario');
  const when = task.finishedAt ?? task.createdAt;
  const body = (
    <>
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-sm leading-snug font-medium text-foreground">
              {taskTitle(task)}
            </span>
            {subtitle !== undefined && (
              <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
            )}
          </span>
          <StatusPill tone={status.tone} className="shrink-0 px-2 py-0.5">
            {status.label}
          </StatusPill>
        </span>
        {task.progress !== undefined && isActive(task) && (
          <span
            role="progressbar"
            aria-label={`Avance: ${progress ?? ''}`}
            aria-valuemin={0}
            aria-valuemax={task.progress.total}
            aria-valuenow={task.progress.done}
            className="block h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="block h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${String((task.progress.done / task.progress.total) * 100)}%` }}
            />
          </span>
        )}
        {failure !== undefined && <span className="text-xs text-destructive">{failure}</span>}
        <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          {progress !== undefined && <span>{progress}</span>}
          {problems !== undefined && (
            <span className="text-warning-700 dark:text-warning-300">{problems}</span>
          )}
          {showRequester && <span>{requester}</span>}
          <span>{formatDateTime(when)}</span>
        </span>
      </span>
    </>
  );
  const rowClass = 'flex gap-3 rounded-md px-2 py-2 text-left';
  return (
    <li>
      {href === undefined ? (
        <div className={rowClass}>{body}</div>
      ) : (
        <Link
          // Rutas armadas en `taskHref`: typedRoutes no puede verificar strings construidos.
          href={href as Route}
          onClick={onNavigate}
          prefetch={false}
          className={cn(
            rowClass,
            'outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
          )}
        >
          {body}
        </Link>
      )}
    </li>
  );
}

function ScopeToggle({
  scope,
  onChange,
}: {
  readonly scope: BackgroundTaskScope;
  readonly onChange: (scope: BackgroundTaskScope) => void;
}) {
  const options: readonly { readonly value: BackgroundTaskScope; readonly label: string }[] = [
    { value: 'mine', label: 'Míos' },
    { value: 'all', label: 'Todos' },
  ];
  return (
    <div role="group" aria-label="Qué procesos ver" className="flex rounded-md bg-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={scope === option.value}
          onClick={() => {
            onChange(option.value);
          }}
          className={cn(
            'rounded px-2 py-0.5 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
            scope === option.value && 'bg-background text-foreground shadow-xs',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TaskList({
  list,
  scope,
  onNavigate,
}: {
  readonly list: ReturnType<typeof useTaskList>;
  readonly scope: BackgroundTaskScope;
  readonly onNavigate: () => void;
}) {
  const { loaded } = list;
  if (loaded.status === 'loading') {
    return (
      <p className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden />
        Cargando procesos…
      </p>
    );
  }
  if (loaded.status === 'error') {
    return <p className="px-3 py-6 text-sm text-destructive">{loaded.message}</p>;
  }
  const { page } = loaded;
  if (page.items.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        {scope === 'mine'
          ? 'No tenés procesos en curso ni terminados en la última semana.'
          : 'No hay procesos en curso ni terminados en la última semana.'}
      </p>
    );
  }
  return (
    <>
      <ul className="max-h-[min(28rem,calc(100vh-10rem))] overflow-y-auto p-1">
        {page.items.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            showRequester={scope === 'all'}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
      {page.total > page.items.length && (
        <div className="border-t border-border px-3 py-2 text-center">
          {list.canShowMore ? (
            <Button type="button" variant="ghost" size="sm" onClick={list.showMore}>
              Ver más
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Y {String(page.total - page.items.length)} más. Limpiá los terminados para ver el
              resto.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Cuántos procesos en segundo plano siguen en curso, para la campana. Mientras algo está en curso
 * y la campana está cerrada, pregunta cada `CLOSED_POLL_MS`; sin nada en curso, no pregunta. Con la
 * campana abierta lo actualiza la lista (`onActive`).
 */
export function useActiveTasks(
  initialActive: number,
  { open, scope }: { readonly open: boolean; readonly scope: BackgroundTaskScope },
) {
  const [active, setActive] = useState(initialActive);
  const onActive = useCallback((count: number) => {
    setActive(count);
  }, []);

  // El layout se vuelve a pintar cuando una acción encola un proceso: trae el contador nuevo (de
  // los propios). Con "Todos" son al menos esos: con algo en curso, el polling trae el número real.
  const [counted, setCounted] = useState(initialActive);
  if (counted !== initialActive) {
    setCounted(initialActive);
    setActive(scope === 'mine' ? initialActive : Math.max(active, initialActive));
  }

  useEffect(() => {
    if (open || active === 0) return undefined;
    const timer = setInterval(() => {
      countBackgroundTasksAction({ scope }).then(
        (response) => {
          if (response.ok) setActive(response.value.active);
        },
        () => undefined,
      );
    }, CLOSED_POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [open, active, scope]);

  return { active, onActive };
}

/**
 * La pestaña "Procesos" de la campana: cada proceso en segundo plano con su avance y su resultado.
 * Los trae mientras está a la vista (`open`) y, con algo en curso, pregunta más seguido.
 */
export function BackgroundTasksPanel({
  open,
  scope,
  onScopeChange,
  canSeeAll,
  onActive,
  onNavigate,
}: {
  readonly open: boolean;
  readonly scope: BackgroundTaskScope;
  readonly onScopeChange: (scope: BackgroundTaskScope) => void;
  /** Puede ver los de todos: el caso de uso lo vuelve a verificar. */
  readonly canSeeAll: boolean;
  readonly onActive: (count: number) => void;
  readonly onNavigate: () => void;
}) {
  const list = useTaskList(open, scope, onActive);

  const finished =
    list.loaded.status === 'ready' ? clearedUntil(list.loaded.page.items) : undefined;
  function clearFinished() {
    if (finished === undefined) return;
    // Preferencia de pantalla, no un dato: el servidor la lee al pedir la lista.
    document.cookie = `${BACKGROUND_TASKS_CLEARED_COOKIE}=${finished}; path=/; max-age=${String(ONE_YEAR_IN_SECONDS)}; samesite=lax`;
    list.reload();
  }

  return (
    <>
      {canSeeAll && (
        <div className="flex justify-end border-b border-border px-3 py-2">
          <ScopeToggle scope={scope} onChange={onScopeChange} />
        </div>
      )}
      <TaskList list={list} scope={scope} onNavigate={onNavigate} />
      {finished !== undefined && (
        <footer className="flex justify-end border-t border-border px-3 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={clearFinished}>
            Limpiar terminados
          </Button>
        </footer>
      )}
    </>
  );
}
