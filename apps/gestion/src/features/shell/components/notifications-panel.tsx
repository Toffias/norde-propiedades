'use client';

import {
  MAX_NOTIFICATIONS_PAGE_SIZE,
  NOTIFICATIONS_PAGE_SIZE,
  type NotificationRow,
  type NotificationTypeValue,
  type NotificationsPage,
} from '@norde/core/notifications/contracts';
import { Button } from '@norde/ui/components/button';
import { cn } from '@norde/ui/lib/utils';
import {
  BriefcaseIcon,
  InboxIcon,
  Loader2Icon,
  type LucideIcon,
  UserRoundIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from '@norde/ui/components/sonner';

import { UNEXPECTED_ERROR_MESSAGE } from '../../../lib/errors';
import { formatDateTime } from '../../../lib/format';
import {
  listNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '../notification-actions';
import { notificationHref, notificationText } from '../notifications';

const TYPE_ICONS: Readonly<Record<NotificationTypeValue, LucideIcon>> = {
  'client.assigned': UserRoundIcon,
  'opportunity.assigned': BriefcaseIcon,
  'inquiry.assigned': InboxIcon,
};

type Loaded =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly page: NotificationsPage }
  | { readonly status: 'error'; readonly message: string };

/** Los avisos de quien entra: los trae al mostrarse y "Ver más" agranda la página. */
function useNotificationList(open: boolean, onUnread: (count: number) => void) {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [pageSize, setPageSize] = useState(NOTIFICATIONS_PAGE_SIZE);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    let stale = false;
    listNotificationsAction({ pageSize }).then(
      (response) => {
        if (stale) return;
        if (response.ok) {
          setLoaded({ status: 'ready', page: response.value });
          onUnread(response.value.unread);
        } else setLoaded({ status: 'error', message: response.message });
      },
      () => {
        if (!stale) setLoaded({ status: 'error', message: UNEXPECTED_ERROR_MESSAGE });
      },
    );
    return () => {
      stale = true;
    };
  }, [open, pageSize, version, onUnread]);

  /** La marca leída en pantalla, sin volver a pedir la lista. */
  function markReadLocally(id: string) {
    if (loaded.status !== 'ready') return;
    const target = loaded.page.items.find((row) => row.id === id);
    if (!target || target.read) return;
    const unread = Math.max(0, loaded.page.unread - 1);
    setLoaded({
      status: 'ready',
      page: {
        ...loaded.page,
        unread,
        items: loaded.page.items.map((row) => (row.id === id ? { ...row, read: true } : row)),
      },
    });
    onUnread(unread);
  }

  return {
    loaded,
    canShowMore:
      loaded.status === 'ready' &&
      loaded.page.total > loaded.page.items.length &&
      pageSize < MAX_NOTIFICATIONS_PAGE_SIZE,
    showMore: () => {
      setPageSize((current) =>
        Math.min(current + NOTIFICATIONS_PAGE_SIZE, MAX_NOTIFICATIONS_PAGE_SIZE),
      );
    },
    reload: () => {
      setVersion((current) => current + 1);
    },
    markReadLocally,
  };
}

function NotificationItem({
  row,
  onOpen,
}: {
  readonly row: NotificationRow;
  readonly onOpen: (row: NotificationRow) => void;
}) {
  const Icon = TYPE_ICONS[row.type];
  const href = notificationHref(row);
  const text = notificationText(row);
  const body = (
    <>
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            'text-sm leading-snug text-foreground',
            row.read ? 'font-normal' : 'font-medium',
          )}
        >
          {text}
        </span>
        <span className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span>
      </span>
      {!row.read && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary">
          <span className="sr-only">Sin leer</span>
        </span>
      )}
    </>
  );
  const rowClass = 'flex gap-3 rounded-md px-2 py-2 text-left';
  return (
    <li>
      {href === undefined ? (
        <button
          type="button"
          onClick={() => {
            onOpen(row);
          }}
          className={cn(
            rowClass,
            'w-full outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
          )}
        >
          {body}
        </button>
      ) : (
        <Link
          // Rutas armadas en `notificationHref`: typedRoutes no puede verificar strings construidos.
          href={href as Route}
          onClick={() => {
            onOpen(row);
          }}
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

/**
 * La pestaña "Avisos" de la campana: lo que le asignaron a quien entra, de lo más nuevo a lo más
 * viejo. Abrir un aviso lo marca leído y lleva a la ficha.
 */
export function NotificationsPanel({
  open,
  onUnread,
  onNavigate,
}: {
  readonly open: boolean;
  readonly onUnread: (count: number) => void;
  readonly onNavigate: () => void;
}) {
  const list = useNotificationList(open, onUnread);
  const [marking, setMarking] = useState(false);
  const { loaded } = list;

  function openNotification(row: NotificationRow) {
    if (!row.read) {
      list.markReadLocally(row.id);
      markNotificationReadAction({ notificationId: row.id }).then(
        (response) => {
          if (!response.ok) toast.error(response.message);
        },
        () => {
          toast.error(UNEXPECTED_ERROR_MESSAGE);
        },
      );
    }
    if (notificationHref(row) !== undefined) onNavigate();
  }

  async function markAllRead() {
    setMarking(true);
    try {
      const response = await markAllNotificationsReadAction();
      if (!response.ok) toast.error(response.message);
      list.reload();
    } catch {
      toast.error(UNEXPECTED_ERROR_MESSAGE);
    } finally {
      setMarking(false);
    }
  }

  if (loaded.status === 'loading') {
    return (
      <p className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden />
        Cargando avisos…
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
        Todavía no tenés avisos. Cuando te asignen un contacto, una oportunidad o una consulta, lo
        vas a ver acá.
      </p>
    );
  }
  return (
    <>
      <ul className="max-h-[min(28rem,calc(100vh-12rem))] overflow-y-auto p-1">
        {page.items.map((row) => (
          <NotificationItem key={row.id} row={row} onOpen={openNotification} />
        ))}
      </ul>
      {(page.unread > 0 || page.total > page.items.length) && (
        <footer className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          {list.canShowMore ? (
            <Button type="button" variant="ghost" size="sm" onClick={list.showMore}>
              Ver más
            </Button>
          ) : page.total > page.items.length ? (
            <p className="text-xs text-muted-foreground">
              Y {String(page.total - page.items.length)} más, más viejos.
            </p>
          ) : (
            <span />
          )}
          {page.unread > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={marking}
              onClick={() => void markAllRead()}
            >
              {marking && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
              Marcar todos como leídos
            </Button>
          )}
        </footer>
      )}
    </>
  );
}
